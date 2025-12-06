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

async function seedRoadsInBbox() {
  try {
    console.log("🌱 Seeding road ratings for roads in specific bbox...\n");

    const entityId = "16f3df7b-9b49-4a94-96c0-b9921c89ca8c"; // Lisbon

    // Target bbox: Lisbon area (from your query)
    const targetBbox = {
      minLng: -9.210368,
      minLat: 38.664487,
      maxLng: -9.068232,
      maxLat: 38.780067,
    };

    console.log(`📍 Target bbox: [${targetBbox.minLng}, ${targetBbox.minLat}, ${targetBbox.maxLng}, ${targetBbox.maxLat}]\n`);

    // Find or create user
    let testUser = await prisma.user.findFirst({
      where: { username: "diogo_fmc" },
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
    }

    const userId = testUser.id;

    // Open faro.gpkg
    const mapFilesDir = path.join(process.cwd(), "map-files");
    const gpkgPath = path.join(mapFilesDir, "faro.gpkg");

    if (!fs.existsSync(gpkgPath)) {
      console.error(`❌ GeoPackage not found at ${gpkgPath}`);
      return;
    }

    console.log(`📦 Opening ${path.basename(gpkgPath)}...`);
    const gpkg = await GeoPackageAPI.open(gpkgPath);

    const featureTables = gpkg.getFeatureTables();
    if (!featureTables || featureTables.length === 0) {
      console.error("❌ No feature tables found");
      return;
    }

    const tableName = featureTables[0];
    console.log(`✅ Using feature table: ${tableName}\n`);

    const featureDao = gpkg.getFeatureDao(tableName);
    if (!featureDao) {
      console.error(`❌ Feature table '${tableName}' not found`);
      return;
    }

    console.log(`🔍 Scanning features for roads in bbox...`);
    const allFeatures = await featureDao.queryForAll();
    console.log(`✅ Found ${allFeatures.length} total features\n`);

    const roadIds: string[] = [];
    const roadIdSet = new Set<string>();
    let checkedCount = 0;
    let inBboxCount = 0;

    for (const f of allFeatures) {
      checkedCount++;
      if (checkedCount % 5000 === 0) {
        console.log(`   Checked ${checkedCount}/${allFeatures.length}, found ${inBboxCount} roads in bbox...`);
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
        continue;
      }

      // Extract geometry
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
        // Ignore
      }

      if (inBbox) {
        roadIdSet.add(roadId);
        roadIds.push(roadId);
        inBboxCount++;
        console.log(`   ✅ Found road ${roadId} in bbox (${inBboxCount} total)`);
      }

      // Stop after finding enough roads
      if (roadIds.length >= 50) {
        break;
      }
    }

    if (roadIds.length === 0) {
      console.error("❌ No roads found in target bbox!");
      console.log("💡 Try expanding the bbox or checking a different area");
      return;
    }

    console.log(`\n✅ Found ${roadIds.length} roads in bbox\n`);
    console.log(`📊 Creating road ratings...\n`);

    const eiriValues = [
      1.2, 1.5, 1.8, 2.0, 2.2, 2.5, 2.8, 3.0, 3.2, 3.5, 3.8, 4.0, 4.2, 4.5, 4.8,
      1.3, 1.6, 1.9, 2.1, 2.3, 2.6, 2.9, 3.1, 3.3, 3.6, 3.9, 4.1, 4.3, 4.6, 4.9,
      1.1, 1.4, 1.7, 2.4, 2.7, 3.4, 3.7, 4.4, 4.7, 5.0,
    ];

    let createdCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < roadIds.length; i++) {
      const roadId = roadIds[i];
      const eiri = eiriValues[i % eiriValues.length] ?? Math.random() * 4 + 1;

      // Check if rating already exists
      const existing = await prisma.roadRating.findUnique({
        where: {
          entityId_roadId: { entityId, roadId },
        },
      });

      if (existing) {
        console.log(`   ⏭️  Road ${roadId} already has rating, skipping...`);
        continue;
      }

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

      // Create RoadRating
      await prisma.roadRating.create({
        data: {
          entityId,
          roadId,
          eiri: avgEiri,
        },
      });

      createdCount++;
      console.log(`   ✅ Road ${roadId}: EIRI ${eiri.toFixed(2)}`);
    }

    console.log(`\n✨ Seeded ${createdCount} new road ratings (${updatedCount} skipped - already exist)`);
    console.log(`\n💡 Test with:`);
    console.log(`   GET /api/roads/map?bbox=${targetBbox.minLng},${targetBbox.minLat},${targetBbox.maxLng},${targetBbox.maxLat}&months=6`);

  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedRoadsInBbox()
    .then(() => {
      console.log("\n✅ Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Failed:", error);
      process.exit(1);
    });
}

export { seedRoadsInBbox };

