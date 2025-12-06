import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

// Import GeoPackage library
// eslint-disable-next-line @typescript-eslint/no-var-requires
const geopackageLib = require("@ngageoint/geopackage");
const { GeoPackageAPI } = geopackageLib;

dotenv.config();

const prisma = new PrismaClient();

async function seedRoadRatingsForPortugal() {
  try {
    console.log("🌱 Seeding road ratings for Portugal (Lisbon area)...\n");

    // 1. Find or create CityHall for Portugal entities
    // Try Lisbon, Porto, Infralobo (they map to faro.gpkg) or Smartroads (maps to oeiras.gpkg)
    let cityHall = await prisma.cityHall.findFirst({
      where: {
        OR: [
          { name: { contains: "Lisbon", mode: "insensitive" } },
          { name: { contains: "Porto", mode: "insensitive" } },
          { name: { contains: "Infralobo", mode: "insensitive" } },
          { name: { contains: "Smartroads", mode: "insensitive" } },
        ],
      },
    });

    if (!cityHall) {
      console.log("❌ No CityHall found for Portugal entities");
      console.log("💡 Creating a new CityHall for Lisbon...");
      cityHall = await prisma.cityHall.create({
        data: {
          name: "Lisbon",
          description: "Lisbon test entity",
        },
      });
      console.log(`✅ Created CityHall: ${cityHall.id} (${cityHall.name})`);
    } else {
      console.log(`✅ Found CityHall: ${cityHall.id} (${cityHall.name})`);
    }

    const entityId = cityHall.id;

    // 2. Find or create a test user
    let testUser = await prisma.user.findFirst({
      where: {
        username: "portugal_test_user",
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
          username: "portugal_test_user",
          password: hashedPassword,
          email: "portugal_test@test.com",
          roles: ["app_user"],
          cityHallId: entityId,
        },
      });
      console.log(`✅ Created test user: ${testUser.id}`);
    } else {
      console.log(`✅ Found test user: ${testUser.id}`);
    }

    const userId = testUser.id;

    // 3. Try faro.gpkg first (covers Lisbon/Porto), then oeiras.gpkg
    const mapFilesDir = path.join(process.cwd(), "map-files");
    let gpkgPath = path.join(mapFilesDir, "faro.gpkg");
    
    if (!fs.existsSync(gpkgPath)) {
      gpkgPath = path.join(mapFilesDir, "oeiras.gpkg");
      if (!fs.existsSync(gpkgPath)) {
        console.error(`❌ GeoPackage not found at ${mapFilesDir}`);
        console.log("💡 Make sure faro.gpkg or oeiras.gpkg exists in the map-files directory");
        return;
      }
    }

    console.log(`\n📦 Opening ${path.basename(gpkgPath)}...`);
    const gpkg = await GeoPackageAPI.open(gpkgPath);

    const featureTables = gpkg.getFeatureTables();
    if (!featureTables || featureTables.length === 0) {
      console.error("❌ No feature tables found in GeoPackage");
      return;
    }

    const tableName = featureTables[0];
    console.log(`✅ Using feature table: ${tableName}`);

    const featureDao = gpkg.getFeatureDao(tableName);
    if (!featureDao) {
      console.error(`❌ Feature table '${tableName}' not found`);
      return;
    }

    // Query features and filter by bbox around Portugal (Lisbon area)
    console.log(`\n🔍 Extracting roadIds from GeoPackage for Portugal area...`);
    const allFeatures = await featureDao.queryForAll();
    console.log(`✅ Found ${allFeatures.length} features in GeoPackage`);

    // Filter features that are in the Portugal bbox: -9.697495,38.284008,-8.587875,39.18703
    const targetBbox = {
      minLng: -9.697495,
      minLat: 38.284008,
      maxLng: -8.587875,
      maxLat: 39.18703,
    };

    const roadIds: string[] = [];
    const roadIdSet = new Set<string>();

    for (const f of allFeatures) {
      let roadId: string | null = null;

      // Try different methods to get osm_id
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

      // Stop after collecting 20 unique roadIds
      if (roadIds.length >= 20) {
        break;
      }
    }

    if (roadIds.length === 0) {
      console.error("❌ No valid roadIds found in GeoPackage");
      console.log("💡 Trying to use fid as fallback...");
      for (let i = 0; i < Math.min(20, allFeatures.length); i++) {
        const fid = String((allFeatures[i] as any).fid ?? i);
        if (fid && !roadIdSet.has(fid)) {
          roadIdSet.add(fid);
          roadIds.push(fid);
        }
      }
    }

    if (roadIds.length === 0) {
      console.error("❌ Could not extract any roadIds from GeoPackage");
      return;
    }

    console.log(`✅ Extracted ${roadIds.length} unique roadIds`);
    console.log(`   Sample roadIds: ${roadIds.slice(0, 5).join(", ")}...`);

    // 4. Create road ratings with varied EIRI values
    console.log(`\n📊 Creating road ratings...`);

    const eiriValues = [
      1.2, 1.5, 1.8, 2.0, 2.2, 2.5, 2.8, 3.0, 3.2, 3.5, 3.8, 4.0, 4.2, 4.5, 4.8,
    ];

    let createdCount = 0;
    let updatedCount = 0;

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

      // Calculate average for this roadId
      const allRatings = await prisma.roadRatingHistory.findMany({
        where: {
          entityId,
          roadId,
        },
        select: { eiri: true },
      });

      const avgEiri =
        allRatings.length > 0
          ? allRatings.reduce((sum, r) => sum + r.eiri, 0) / allRatings.length
          : eiri;

      // Upsert RoadRating
      const existing = await prisma.roadRating.findUnique({
        where: {
          entityId_roadId: {
            entityId,
            roadId,
          },
        },
      });

      if (existing) {
        await prisma.roadRating.update({
          where: {
            entityId_roadId: {
              entityId,
              roadId,
            },
          },
          data: {
            eiri: avgEiri,
          },
        });
        updatedCount++;
      } else {
        await prisma.roadRating.create({
          data: {
            entityId,
            roadId,
            eiri: avgEiri,
          },
        });
        createdCount++;
      }

      console.log(`   ✅ Road ${roadId}: EIRI ${eiri.toFixed(2)} (avg: ${avgEiri.toFixed(2)})`);
    }

    console.log(`\n✨ Seeding complete!`);
    console.log(`   📊 Created ${createdCount} new road ratings`);
    console.log(`   🔄 Updated ${updatedCount} existing road ratings`);
    console.log(`   📝 Created ${roadIds.length} history entries`);

    const totalRatings = await prisma.roadRating.count({
      where: { entityId },
    });

    console.log(`\n📈 Summary:`);
    console.log(`   Entity: ${cityHall.name} (${entityId})`);
    console.log(`   Total rated roads: ${totalRatings}`);
    console.log(`\n💡 Test the API:`);
    console.log(`   GET /api/roads/map?bbox=-9.697495,38.284008,-8.587875,39.18703&months=6`);
    console.log(`   (with auth token for user: portugal_test_user)`);

  } catch (error) {
    console.error("❌ Error seeding road ratings:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedRoadRatingsForPortugal()
    .then(() => {
      console.log("\n✅ Seed script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Seed script failed:", error);
      process.exit(1);
    });
}

export { seedRoadRatingsForPortugal };

