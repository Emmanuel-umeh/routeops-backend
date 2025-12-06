import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

// Import GeoPackage library
// eslint-disable-next-line @typescript-eslint/no-var-requires
const geopackageLib = require("@ngageoint/geopackage");
const { GeoPackageAPI, GeometryData } = geopackageLib;

dotenv.config();

const prisma = new PrismaClient();

async function checkAndSeedRoadRatings() {
  try {
    console.log("🔍 Checking road ratings for Lisbon entity...\n");

    // Your specific entity ID
    const entityId = "16f3df7b-9b49-4a94-96c0-b9921c89ca8c";

    // Check if entity exists
    const cityHall = await prisma.cityHall.findUnique({
      where: { id: entityId },
    });

    if (!cityHall) {
      console.error(`❌ Entity ${entityId} not found!`);
      return;
    }

    console.log(`✅ Found entity: ${cityHall.name} (${entityId})\n`);

    // Check existing ratings
    const existingRatings = await prisma.roadRating.count({
      where: { entityId },
    });

    console.log(`📊 Existing road ratings: ${existingRatings}\n`);

    if (existingRatings > 0) {
      console.log("✅ Road ratings already exist for this entity!");
      const ratings = await prisma.roadRating.findMany({
        where: { entityId },
        take: 5,
        select: {
          roadId: true,
          eiri: true,
        },
      });
      console.log("Sample roadIds:", ratings.map((r) => r.roadId).join(", "));
      return;
    }

    console.log("🌱 No ratings found. Seeding road ratings...\n");

    // Find or create a test user for this entity
    let testUser = await prisma.user.findFirst({
      where: {
        username: "diogo_fmc", // Use the actual user
      },
    });

    if (!testUser) {
      const { BCRYPT_SALT } = process.env;
      if (!BCRYPT_SALT) {
        throw new Error("BCRYPT_SALT environment variable must be defined");
      }
      const salt = parseSalt(BCRYPT_SALT);
      const hashedPassword = await hash("password123", salt);

      testUser = await prisma.user.create({
        data: {
          username: "lisbon_test_user",
          password: hashedPassword,
          email: "lisbon_test@test.com",
          roles: ["app_user"],
          cityHallId: entityId,
        },
      });
      console.log(`✅ Created test user: ${testUser.id}`);
    } else {
      console.log(`✅ Using existing user: ${testUser.username} (${testUser.id})`);
    }

    const userId = testUser.id;

    // Use faro.gpkg (Lisbon uses faro.gpkg)
    const mapFilesDir = path.join(process.cwd(), "map-files");
    const gpkgPath = path.join(mapFilesDir, "faro.gpkg");

    if (!fs.existsSync(gpkgPath)) {
      console.error(`❌ GeoPackage not found at ${gpkgPath}`);
      return;
    }

    console.log(`\n📦 Opening ${path.basename(gpkgPath)}...`);
    const gpkg = await GeoPackageAPI.open(gpkgPath);

    const featureTables = gpkg.getFeatureTables();
    if (!featureTables || featureTables.length === 0) {
      console.error("❌ No feature tables found");
      return;
    }

    const tableName = featureTables[0];
    console.log(`✅ Using feature table: ${tableName}`);

    const featureDao = gpkg.getFeatureDao(tableName);
    if (!featureDao) {
      console.error(`❌ Feature table '${tableName}' not found`);
      return;
    }

    console.log(`\n🔍 Extracting roadIds within Lisbon bbox...`);
    const allFeatures = await featureDao.queryForAll();
    console.log(`✅ Found ${allFeatures.length} features`);

    // Target bbox for Lisbon area (similar to what frontend queries)
    const targetBbox = {
      minLng: -9.75,
      minLat: 38.3,
      maxLng: -8.6,
      maxLat: 39.3,
    };

    const roadIds: string[] = [];
    const roadIdSet = new Set<string>();
    let checkedCount = 0;

    for (const f of allFeatures) {
      checkedCount++;
      if (checkedCount % 1000 === 0) {
        console.log(`   Checked ${checkedCount}/${allFeatures.length} features, found ${roadIds.length} roads in bbox...`);
      }

      // Extract roadId
      let roadId: string | null = null;
      if (typeof (f as any).getValue === "function") {
        try {
          roadId = String((f as any).getValue("osm_id") ?? (f as any).getValue("full_id") ?? "");
        } catch (e) {
          // Ignore
        }
      } else {
        roadId = String((f as any).osm_id ?? (f as any).full_id ?? "");
      }

      if (!roadId || roadId === "null" || roadId === "undefined" || roadId.trim().length === 0) {
        continue;
      }

      if (roadIdSet.has(roadId)) {
        continue; // Already processed this roadId
      }

      // Extract geometry and check if it's in bbox
      let geom: any = null;
      const geomProp = (f as any).geom ?? (f as any).geometry;

      if (geomProp && geomProp.type && geomProp.coordinates) {
        geom = geomProp;
      } else if (Buffer.isBuffer(geomProp) || (geomProp instanceof Uint8Array)) {
        try {
          if (typeof GeoPackageAPI.parseGeometryData === "function") {
            const geometryData = GeoPackageAPI.parseGeometryData(geomProp);
            if (geometryData) {
              if (typeof geometryData.toGeoJSON === "function") {
                const geoJson = geometryData.toGeoJSON();
                geom = geoJson?.geometry || geoJson;
              }
            }
          } else if (GeometryData) {
            const geometryData = new GeometryData(geomProp);
            if (typeof geometryData.toGeoJSON === "function") {
              const geoJson = geometryData.toGeoJSON();
              geom = geoJson?.geometry || geoJson;
            }
          }
        } catch (e) {
          // Ignore
        }
      }

      if (!geom || !geom.coordinates || !Array.isArray(geom.coordinates)) {
        continue;
      }

      // Check if geometry is in bbox
      let inBbox = false;
      try {
        // For LineString, check if any coordinate is in bbox
        const coords = geom.type === "LineString" 
          ? geom.coordinates 
          : geom.type === "MultiLineString" 
            ? geom.coordinates.flat() 
            : [];

        for (const coord of coords) {
          if (Array.isArray(coord) && coord.length >= 2) {
            const [lng, lat] = coord;
            if (
              lng >= targetBbox.minLng &&
              lng <= targetBbox.maxLng &&
              lat >= targetBbox.minLat &&
              lat <= targetBbox.maxLat
            ) {
              inBbox = true;
              break;
            }
          }
        }
      } catch (e) {
        // Ignore bbox check errors
      }

      if (inBbox) {
        roadIdSet.add(roadId);
        roadIds.push(roadId);
        console.log(`   ✅ Found road ${roadId} in bbox (${roadIds.length} total)`);
      }

      // Stop after finding enough roads
      if (roadIds.length >= 30) {
        break;
      }
    }

    // If we didn't find enough roads in bbox, seed some random ones as fallback
    if (roadIds.length < 10) {
      console.log(`⚠️  Only found ${roadIds.length} roads in bbox. Adding more roads as fallback...`);
      for (const f of allFeatures) {
        if (roadIds.length >= 30) break;

        let roadId: string | null = null;
        if (typeof (f as any).getValue === "function") {
          try {
            roadId = String((f as any).getValue("osm_id") ?? (f as any).getValue("full_id") ?? "");
          } catch (e) {
            // Ignore
          }
        } else {
          roadId = String((f as any).osm_id ?? (f as any).full_id ?? "");
        }

        if (roadId && roadId !== "null" && roadId !== "undefined" && roadId.trim().length > 0) {
          if (!roadIdSet.has(roadId)) {
            roadIdSet.add(roadId);
            roadIds.push(roadId);
          }
        }
      }
    }

    if (roadIds.length === 0) {
      console.error("❌ Could not extract any roadIds");
      return;
    }

    console.log(`✅ Extracted ${roadIds.length} roadIds: ${roadIds.slice(0, 5).join(", ")}...\n`);

    // Create ratings
    const eiriValues = [
      1.2, 1.5, 1.8, 2.0, 2.2, 2.5, 2.8, 3.0, 3.2, 3.5, 3.8, 4.0, 4.2, 4.5, 4.8,
    ];

    let createdCount = 0;

    for (let i = 0; i < Math.min(roadIds.length, eiriValues.length); i++) {
      const roadId = roadIds[i];
      const eiri = eiriValues[i] ?? Math.random() * 4 + 1;

      // Create history entry
      await prisma.roadRatingHistory.create({
        data: {
          entityId,
          roadId,
          eiri,
          userId,
        },
      });

      // Calculate average
      const allRatings = await prisma.roadRatingHistory.findMany({
        where: { entityId, roadId },
        select: { eiri: true },
      });

      const avgEiri =
        allRatings.length > 0
          ? allRatings.reduce((sum, r) => sum + r.eiri, 0) / allRatings.length
          : eiri;

      // Upsert RoadRating
      await prisma.roadRating.upsert({
        where: {
          entityId_roadId: { entityId, roadId },
        },
        create: {
          entityId,
          roadId,
          eiri: avgEiri,
        },
        update: {
          eiri: avgEiri,
        },
      });

      createdCount++;
      console.log(`   ✅ Road ${roadId}: EIRI ${eiri.toFixed(2)}`);
    }

    console.log(`\n✨ Seeded ${createdCount} road ratings for entity ${entityId}`);
    console.log(`\n💡 Test with:`);
    console.log(`   GET /api/roads/map?bbox=-9.748462,38.314733,-8.611377,39.238645&months=6`);

  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  checkAndSeedRoadRatings()
    .then(() => {
      console.log("\n✅ Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Failed:", error);
      process.exit(1);
    });
}

export { checkAndSeedRoadRatings };

