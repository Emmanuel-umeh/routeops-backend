import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const geopackageLib = require("@ngageoint/geopackage");
const { GeoPackageAPI, GeometryData } = geopackageLib;

if (require.main === module) {
  dotenv.config();
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
  console.info("🚀 Migrating GPKG files to PostGIS...");
  console.info("");

  const prisma = new PrismaClient();

  try {
    // Step 1: Enable PostGIS extension
    console.info("📝 Step 1: Enabling PostGIS extension...");
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS postgis;`);
    console.info("✅ PostGIS extension enabled");
    console.info("");

    // Step 2: Create roads table
    console.info("📝 Step 2: Creating roads table...");
    const createTableSql = `
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
      );
      
      CREATE INDEX IF NOT EXISTS road_geom_idx ON "Road" USING GIST (geom);
      CREATE INDEX IF NOT EXISTS road_edge_id_idx ON "Road" (edge_id);
      CREATE INDEX IF NOT EXISTS road_city_hall_idx ON "Road" (city_hall_id);
      CREATE INDEX IF NOT EXISTS road_edge_city_idx ON "Road" (edge_id, city_hall_id);
    `;
    await prisma.$executeRawUnsafe(createTableSql);
    console.info("✅ Roads table created");
    console.info("");

    // Step 3: Clear existing roads (optional - comment out if you want to keep existing data)
    console.info("📝 Step 3: Clearing existing roads data...");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Road" CASCADE;`);
    console.info("✅ Existing roads cleared");
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

      // Process features in batches
      const BATCH_SIZE = 100;
      let roadsInFile = 0;

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

            // Extract geometry
            let geometry: any = null;

            // Try toGeoJSON first
            if (typeof feature.toGeoJSON === "function") {
              const geoJson = feature.toGeoJSON();
              geometry = geoJson?.geometry || geoJson;
            }

            // Try parsing from geom buffer
            if (!geometry && feature.geom) {
              if (Buffer.isBuffer(feature.geom) || feature.geom instanceof Uint8Array) {
                try {
                  if (typeof GeoPackageAPI.parseGeometryData === "function") {
                    const geometryData = GeoPackageAPI.parseGeometryData(feature.geom);
                    if (geometryData && typeof geometryData.toGeoJSON === "function") {
                      const geoJson = geometryData.toGeoJSON();
                      geometry = geoJson?.geometry || geoJson;
                    }
                  }
                } catch (e) {
                  // Skip this feature
                  continue;
                }
              } else if (feature.geom.type && feature.geom.coordinates) {
                geometry = feature.geom;
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

            insertValues.push(
              `('${escapedEdgeId}', '${cityHall.id}', ${escapedName === "NULL" ? "NULL" : `'${escapedName}'`}, ${escapedHighway === "NULL" ? "NULL" : `'${escapedHighway}'`}, ST_GeomFromText('${wkt}', 4326), '${propertiesJson}'::jsonb)`
            );
          } catch (error: any) {
            console.warn(`   ⚠️  Error processing feature: ${error?.message || error}`);
            continue;
          }
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
            console.error(`   ❌ Error inserting batch: ${error?.message || error}`);
            // Try inserting one by one to identify problematic features
            for (const value of insertValues) {
              try {
                await prisma.$executeRawUnsafe(
                  `INSERT INTO "Road" (edge_id, city_hall_id, name, highway, geom, properties) VALUES ${value} ON CONFLICT DO NOTHING;`
                );
                roadsInFile++;
              } catch (e: any) {
                console.warn(`   ⚠️  Skipped problematic feature: ${e?.message || e}`);
              }
            }
          }
        }
      }

      console.info(`   ✅ Loaded ${roadsInFile} roads from ${gpkgFilename}`);
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
