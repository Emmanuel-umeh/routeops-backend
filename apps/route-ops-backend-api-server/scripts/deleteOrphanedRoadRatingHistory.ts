import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function deleteOrphanedRoadRatingHistory() {
  try {
    console.log("🔍 Finding RoadRatingHistory entries without surveyId or projectId...");

    // Count entries without surveyId or projectId
    const count = await prisma.roadRatingHistory.count({
      where: {
        OR: [
          { surveyId: null },
          { projectId: null },
        ],
      },
    });

    console.log(`📊 Found ${count} entries without surveyId or projectId`);

    if (count === 0) {
      console.log("✅ No orphaned entries found. Database is clean!");
      return;
    }

    // Show a sample of what will be deleted
    const sample = await prisma.roadRatingHistory.findMany({
      where: {
        OR: [
          { surveyId: null },
          { projectId: null },
        ],
      },
      take: 5,
      select: {
        id: true,
        roadId: true,
        eiri: true,
        surveyId: true,
        projectId: true,
        createdAt: true,
      },
    });

    console.log("\n📋 Sample of entries to be deleted:");
    sample.forEach((entry, index) => {
      console.log(
        `  ${index + 1}. ID: ${entry.id}, RoadId: ${entry.roadId}, EIRI: ${entry.eiri}, SurveyId: ${entry.surveyId}, ProjectId: ${entry.projectId}, Created: ${entry.createdAt}`
      );
    });

    // Delete entries without surveyId or projectId
    console.log(`\n🗑️  Deleting ${count} orphaned entries...`);
    const result = await prisma.roadRatingHistory.deleteMany({
      where: {
        OR: [
          { surveyId: null },
          { projectId: null },
        ],
      },
    });

    console.log(`✅ Successfully deleted ${result.count} orphaned RoadRatingHistory entries`);
    console.log("\n✨ Database cleanup complete!");
  } catch (error) {
    console.error("❌ Error deleting orphaned entries:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
deleteOrphanedRoadRatingHistory()
  .then(() => {
    console.log("\n🎉 Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Script failed:", error);
    process.exit(1);
  });
