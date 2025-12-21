import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const geopackageLib = require("@ngageoint/geopackage");
const { GeoPackageAPI, GeometryData } = geopackageLib;

/**
 * Production migration script for PostGIS
 * 
 * Usage:
 *   DATABASE_URL="postgresql://..." npm run migrate:gpkg-to-postgis:prod
 * 
 * Or set DATABASE_URL in .env.production
 */

if (require.main === module) {
  // Load .env.production if it exists, otherwise use .env
  const envFile = fs.existsSync('.env.production') ? '.env.production' : '.env';
  dotenv.config({ path: envFile });
  
  // Allow override via command line
  const args = process.argv.slice(2);
  if (args[0] && args[0].startsWith('postgresql://')) {
    process.env.DATABASE_URL = args[0];
  }

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable is required");
    console.error("Usage: DATABASE_URL='postgresql://...' npm run migrate:gpkg-to-postgis:prod");
    process.exit(1);
  }

  migrateGpkgToPostgis().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// Mapping of GPKG filenames to city hall names
const GPKG_TO_CITYHALL_MAP: Record<string, string> = {
  "faro.gpkg": "Infralobo",
  "oeiras.gpkg": "SmartRoads",
  "silopi.gpkg": "Tagcoders",
};

async function migrateGpkgToPostgis() {
  console.info("🚀 Migrating GPKG files to PostGIS (PRODUCTION)...");
  console.info(`📊 Database: postgresql://routeops_dev_dv_user:HI6046aOrAGyOqmuwcLuAsPU9QJdblnb@dpg-d4q32i4hg0os7381ivm0-a.oregon-postgres.render.com/routeops_dev_dv_b0ge`);
  console.info("");

  // Create Prisma client with custom DATABASE_URL
  // Render databases require SSL - use no-verify for compatibility
  let databaseUrl = "postgresql://routeops_dev_dv_user:HI6046aOrAGyOqmuwcLuAsPU9QJdblnb@dpg-d4q32i4hg0os7381ivm0-a.oregon-postgres.render.com/routeops_dev_dv_b0ge"
  
  // Add SSL mode if not present (required for Render)
  // Using 'no-verify' for Render databases that have certificate issues
  if (databaseUrl && !databaseUrl.includes('sslmode=')) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    databaseUrl = `${databaseUrl}${separator}sslmode=no-verify`;
  }
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    // Step 1: Enable PostGIS extension
    console.info("📝 Step 1: Enabling PostGIS extension...");
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS postgis;`);
    console.info("✅ PostGIS extension enabled");
    console.info("");

    // Step 2: Create roads table
    console.info("📝 Step 2: Creating roads table...");
    
    // Create table (single statement)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Road" (
        id SERIAL PRIMARY KEY,
        edge_id TEXT NOT NULL,
        city_hall_id TEXT NOT NULL,
        name TEXT,
        highway TEXT,
        geom GEOMETRY(LineString, 4326) NOT NULL,
        properties JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_road_city_hall FOREIGN KEY (city_hall_id) REFERENCES "CityHall"(id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes separately (one per statement)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS road_geom_idx ON "Road" USING GIST (geom)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS road_edge_id_idx ON "Road" (edge_id)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS road_city_hall_idx ON "Road" (city_hall_id)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS road_edge_city_idx ON "Road" (edge_id, city_hall_id)`);
    
    console.info("✅ Roads table created");
    console.info("");

    // Step 3: Ask for confirmation before clearing (safety check)
    console.info("⚠️  WARNING: This will clear existing roads data!");
    console.info("📝 Step 3: Clearing existing roads data...");
    
    // For production, we might want to keep existing data
    // Uncomment the next line if you want to clear existing roads
    // await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Road" CASCADE;`);
    
    // Instead, let's check if there's existing data
    const existingCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM "Road";`
    );
    const count = Number(existingCount[0]?.count || 0);
    
    if (count > 0) {
      console.warn(`⚠️  Found ${count} existing roads in database.`);
      console.warn("   To clear and reload, uncomment TRUNCATE line in script.");
      console.warn("   Continuing with append mode (may create duplicates)...");
    } else {
      console.info("✅ No existing roads found, ready to load");
    }
    console.info("");

    // Step 4: Get map-files directory
    const mapFilesDir = path.join(process.cwd(), "map-files");
    if (!fs.existsSync(mapFilesDir)) {
      throw new Error(`Map files directory not found: ${mapFilesDir}`);
    }

    // Step 5: Get all city halls
    const cityHalls = await prisma.cityHall.findMany({
      select: { id: true, name: true, gisFileUrl: true },
    });

    console.info(`📝 Step 4: Found ${cityHalls.length} city halls`);
    console.info("");

    // Step 6: Process each GPKG file
    let totalRoadsLoaded = 0;

    for (const [gpkgFilename, cityHallName] of Object.entries(GPKG_TO_CITYHALL_MAP)) {
      const cityHall = cityHalls.find((ch) => ch.name === cityHallName);
      if (!cityHall) {
        console.warn(`⚠️  City hall "${cityHallName}" not found, skipping ${gpkgFilename}`);
        continue;
      }

      const gpkgPath = path.join(mapFilesDir, gpkgFilename);
      if (!fs.existsSync(gpkgPath)) {
        console.warn(`⚠️  GPKG file not found: ${gpkgPath}, skipping`);
        continue;
      }

      console.info(`📦 Processing ${gpkgFilename} for ${cityHallName}...`);

      // Open GPKG file
      const gpkg = await GeoPackageAPI.open(gpkgPath);
      const featureTables = gpkg.getFeatureTables();

      if (featureTables.length === 0) {
        console.warn(`⚠️  No feature tables found in ${gpkgFilename}`);
        continue;
      }

      const tableName = featureTables[0];
      const featureDao = gpkg.getFeatureDao(tableName);

      if (!featureDao) {
        console.warn(`⚠️  Feature DAO not found for table ${tableName}`);
        continue;
      }

      // Get all features
      let features: any[] = [];
      try {
        if (typeof featureDao.queryForAll === "function") {
          const results = featureDao.queryForAll();
          features = Array.isArray(results) ? results : Array.from(results || []);
        } else {
          // Fallback: try to iterate
          let count = 0;
          if (typeof featureDao.count === "function") {
            count = featureDao.count();
          }
          for (let i = 1; i <= Math.min(count, 10000); i++) {
            try {
              const feature = featureDao.queryForId(i);
              if (feature) features.push(feature);
            } catch (e) {
              // Skip missing IDs
            }
          }
        }
      } catch (error: any) {
        console.error(`❌ Error loading features from ${gpkgFilename}: ${error?.message || error}`);
        continue;
      }

      console.info(`   Found ${features.length} features`);

      // Log first feature structure for debugging
      if (features.length > 0) {
        const firstFeature = features[0];
        console.info(`   Sample feature keys: ${Object.keys(firstFeature).slice(0, 10).join(', ')}`);
        console.info(`   Has geom: ${!!firstFeature.geom}, Has geometry: ${!!firstFeature.geometry}`);
        console.info(`   Has toGeoJSON: ${typeof firstFeature.toGeoJSON === 'function'}`);
      }

      // Process features in batches
      const BATCH_SIZE = 100;
      let roadsInFile = 0;
      let skippedCount = 0;
      let geometryFailures = 0;
      let typeFailures = 0;

      for (let i = 0; i < features.length; i += BATCH_SIZE) {
        const batch = features.slice(i, i + BATCH_SIZE);
        const insertValues: string[] = [];

        for (const feature of batch) {
          try {
            // Extract edge_id
            const edgeId =
              feature.osm_id ??
              feature.full_id ??
              feature.fid ??
              feature.properties?.osm_id ??
              feature.properties?.full_id ??
              feature.properties?.fid ??
              String(feature.fid ?? `unknown_${i}`);

            // Extract name
            const name =
              feature.name ??
              feature.properties?.name ??
              feature.highway ??
              feature.properties?.highway ??
              null;

            const highway =
              feature.highway ?? feature.properties?.highway ?? null;

            // Extract geometry - try multiple methods
            let geometry: any = null;

            // Method 1: Try toGeoJSON on feature
            if (typeof feature.toGeoJSON === "function") {
              try {
                const geoJson = feature.toGeoJSON();
                geometry = geoJson?.geometry || geoJson;
              } catch (e) {
                // Continue to next method
              }
            }

            // Method 2: Try parsing from geom buffer (most common)
            if (!geometry && feature.geom) {
              if (Buffer.isBuffer(feature.geom) || feature.geom instanceof Uint8Array) {
                try {
                  if (typeof GeoPackageAPI.parseGeometryData === "function") {
                    const geometryData = GeoPackageAPI.parseGeometryData(feature.geom);
                    if (geometryData) {
                      if (typeof geometryData.toGeoJSON === "function") {
                        const geoJson = geometryData.toGeoJSON();
                        geometry = geoJson?.geometry || geoJson;
                      } else if (typeof geometryData.getGeometry === "function") {
                        const geometryObj = geometryData.getGeometry();
                        if (geometryObj) {
                          if (typeof geometryObj.toGeoJSON === "function") {
                            const geoJson = geometryObj.toGeoJSON();
                            geometry = geoJson?.geometry || geoJson;
                          } else if (geometryObj.coordinates) {
                            geometry = geometryObj;
                          }
                        }
                      }
                    }
                  } else if (GeometryData) {
                    // Fallback: try using GeometryData constructor directly
                    try {
                      const geometryData = new GeometryData(feature.geom);
                      if (typeof geometryData.toGeoJSON === "function") {
                        const geoJson = geometryData.toGeoJSON();
                        geometry = geoJson?.geometry || geoJson;
                      }
                    } catch (e) {
                      // Continue
                    }
                  }
                } catch (e) {
                  // Continue to next method
                }
              } else if (feature.geom.type && feature.geom.coordinates) {
                // Already a geometry object
                geometry = feature.geom;
              }
            }

            // Method 3: Try geometry property directly
            if (!geometry && feature.geometry) {
              if (feature.geometry.type && feature.geometry.coordinates) {
                geometry = feature.geometry;
              }
            }

            // Method 4: Try getValue method (if feature has it)
            if (!geometry && typeof (feature as any).getValue === "function") {
              try {
                const geomValue = (feature as any).getValue("geom") || (feature as any).getValue("geometry");
                if (geomValue) {
                  if (Buffer.isBuffer(geomValue) || geomValue instanceof Uint8Array) {
                    if (typeof GeoPackageAPI.parseGeometryData === "function") {
                      const geometryData = GeoPackageAPI.parseGeometryData(geomValue);
                      if (geometryData && typeof geometryData.toGeoJSON === "function") {
                        const geoJson = geometryData.toGeoJSON();
                        geometry = geoJson?.geometry || geoJson;
                      }
                    }
                  } else if (geomValue.type && geomValue.coordinates) {
                    geometry = geomValue;
                  }
                }
              } catch (e) {
                // Continue
              }
            }

            if (!geometry || !geometry.coordinates) {
              continue; // Skip features without valid geometry
            }

            // Only process LineString geometries
            if (geometry.type !== "LineString" && geometry.type !== "MultiLineString") {
              continue;
            }

            // Convert MultiLineString to LineString (take first line)
            let lineString = geometry;
            if (geometry.type === "MultiLineString" && geometry.coordinates.length > 0) {
              lineString = {
                type: "LineString",
                coordinates: geometry.coordinates[0],
              };
            }

            // Convert to WKT for PostGIS
            const wkt = `LINESTRING(${lineString.coordinates
              .map((coord: number[]) => `${coord[0]} ${coord[1]}`)
              .join(", ")})`;

            // Store other properties as JSONB
            const properties: any = {};
            for (const key in feature) {
              if (key !== "geom" && key !== "geometry" && typeof feature[key] !== "function") {
                properties[key] = feature[key];
              }
            }
            if (feature.properties) {
              Object.assign(properties, feature.properties);
            }

            // Escape single quotes in strings
            const escapedEdgeId = edgeId.replace(/'/g, "''");
            const escapedName = name ? name.replace(/'/g, "''") : "NULL";
            const escapedHighway = highway ? highway.replace(/'/g, "''") : "NULL";
            const propertiesJson = JSON.stringify(properties).replace(/'/g, "''");

            // Validate WKT before adding
            if (!wkt || wkt === 'LINESTRING()' || wkt.length < 20) {
              skippedCount++;
              if (skippedCount <= 3) {
                console.warn(`   ⚠️  Invalid WKT for feature ${i}: ${wkt.substring(0, 50)}`);
              }
              continue;
            }

            insertValues.push(
              `('${escapedEdgeId}', '${cityHall.id}', ${escapedName === "NULL" ? "NULL" : `'${escapedName}'`}, ${escapedHighway === "NULL" ? "NULL" : `'${escapedHighway}'`}, ST_GeomFromText('${wkt}', 4326), '${propertiesJson}'::jsonb)`
            );
          } catch (error: any) {
            skippedCount++;
            if (skippedCount <= 5) {
              console.warn(`   ⚠️  Error processing feature ${i}: ${error?.message || error}`);
            }
            continue;
          }
        }

        // Log batch status
        if (insertValues.length === 0 && i < BATCH_SIZE) {
          console.warn(`   ⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1}: No valid features to insert (skipped: ${skippedCount}, geometry failures: ${geometryFailures}, type failures: ${typeFailures})`);
        }

        if (insertValues.length > 0) {
          const insertSql = `
            INSERT INTO "Road" (edge_id, city_hall_id, name, highway, geom, properties)
            VALUES ${insertValues.join(",\n            ")}
            ON CONFLICT DO NOTHING;
          `;

          try {
            await prisma.$executeRawUnsafe(insertSql);
            roadsInFile += insertValues.length;
            if ((i + BATCH_SIZE) % 1000 === 0) {
              console.info(`   Processed ${Math.min(i + BATCH_SIZE, features.length)}/${features.length} features...`);
            }
          } catch (error: any) {
            console.error(`   ❌ Error inserting batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error?.message || error}`);
            console.error(`   First value in batch: ${insertValues[0]?.substring(0, 100)}...`);
            
            // Try inserting one by one to identify problematic features
            let successCount = 0;
            for (let idx = 0; idx < insertValues.length; idx++) {
              try {
                await prisma.$executeRawUnsafe(
                  `INSERT INTO "Road" (edge_id, city_hall_id, name, highway, geom, properties) VALUES ${insertValues[idx]} ON CONFLICT DO NOTHING;`
                );
                roadsInFile++;
                successCount++;
              } catch (e: any) {
                if (idx < 3) {
                  console.warn(`   ⚠️  Skipped problematic feature ${idx}: ${e?.message || e}`);
                  console.warn(`   Value: ${insertValues[idx]?.substring(0, 150)}...`);
                }
              }
            }
            if (successCount > 0) {
              console.info(`   ✅ Inserted ${successCount}/${insertValues.length} features from failed batch`);
            }
          }
        }
      }

      console.info(`   ✅ Loaded ${roadsInFile} roads from ${gpkgFilename}`);
      if (skippedCount > 0 || geometryFailures > 0 || typeFailures > 0) {
        console.info(`   ⚠️  Skipped: ${skippedCount}, Geometry failures: ${geometryFailures}, Type failures: ${typeFailures}`);
      }
      totalRoadsLoaded += roadsInFile;
      console.info("");
    }

    console.info("🎉 Migration completed successfully!");
    console.info(`   Total roads loaded: ${totalRoadsLoaded}`);
    console.info("");

    // Verify data
    const roadCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM "Road";`
    );
    console.info(`📊 Verification: ${roadCount[0]?.count || 0} roads in database`);
    console.info("");
  } catch (error) {
    console.error("❌ Error during migration:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

export { migrateGpkgToPostgis };
