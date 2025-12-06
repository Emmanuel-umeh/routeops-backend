import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

async function cleanRoadRatings() {
  try {
    console.log("🧹 Cleaning road ratings data...\n");

    // Option 1: Clean all road ratings
    // Option 2: Clean only for specific entity (uncomment and set entityId)
    // const entityId = "16f3df7b-9b49-4a94-96c0-b9921c89ca8c"; // Lisbon
    // const whereClause = { entityId };

    const whereClause = {}; // Clean all

    // Count existing data
    const historyCount = await prisma.roadRatingHistory.count({
      where: whereClause,
    });
    const ratingCount = await prisma.roadRating.count({
      where: whereClause,
    });

    console.log(`📊 Found:`);
    console.log(`   RoadRatingHistory: ${historyCount} entries`);
    console.log(`   RoadRating: ${ratingCount} entries\n`);

    if (historyCount === 0 && ratingCount === 0) {
      console.log("✅ No data to clean!");
      return;
    }

    // Delete in correct order (history first due to foreign keys)
    console.log("🗑️  Deleting RoadRatingHistory...");
    const deletedHistory = await prisma.roadRatingHistory.deleteMany({
      where: whereClause,
    });
    console.log(`   ✅ Deleted ${deletedHistory.count} history entries`);

    console.log("🗑️  Deleting RoadRating...");
    const deletedRatings = await prisma.roadRating.deleteMany({
      where: whereClause,
    });
    console.log(`   ✅ Deleted ${deletedRatings.count} rating entries`);

    console.log("\n✨ Cleanup complete!");
    console.log(`   Removed ${deletedHistory.count} history entries`);
    console.log(`   Removed ${deletedRatings.count} rating entries`);

  } catch (error) {
    console.error("❌ Error cleaning road ratings:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  cleanRoadRatings()
    .then(() => {
      console.log("\n✅ Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Failed:", error);
      process.exit(1);
    });
}

export { cleanRoadRatings };


