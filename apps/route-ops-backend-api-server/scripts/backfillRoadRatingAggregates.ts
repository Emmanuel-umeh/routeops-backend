/**
 * Backfill script to populate precomputed aggregates in RoadRating table
 * 
 * This script calculates and updates:
 * - totalSurveys: Count of distinct surveys per road
 * - totalAnomalies: Sum of anomalies across all surveys
 * - uniqueUsers: Count of distinct users who surveyed
 * - lastSurveyDate: Most recent survey date
 * - eiri: Average EIRI (recalculates to ensure accuracy)
 * 
 * Usage:
 *   npx ts-node scripts/backfillRoadRatingAggregates.ts
 * 
 * Options:
 *   --entityId <id>  - Only backfill for specific entity (CityHall)
 *   --dry-run        - Show what would be updated without making changes
 *   --batch-size <n> - Process N roads at a time (default: 100)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface BackfillOptions {
  entityId?: string;
  dryRun: boolean;
  batchSize: number;
}

async function backfillRoadRatingAggregates(options: BackfillOptions) {
  const { entityId, dryRun, batchSize } = options;

  console.log("🚀 Starting RoadRating aggregates backfill...");
  console.log(`   Entity ID: ${entityId || "ALL"}`);
  console.log(`   Dry Run: ${dryRun ? "YES (no changes will be made)" : "NO"}`);
  console.log(`   Batch Size: ${batchSize}`);
  console.log("");

  // Get all unique entityId + roadId combinations that have history
  const whereClause = entityId ? { entityId } : {};
  
  const uniqueRoads = await prisma.roadRatingHistory.groupBy({
    by: ["entityId", "roadId"],
    where: whereClause,
    _count: {
      roadId: true,
    },
  });

  console.log(`📊 Found ${uniqueRoads.length} unique roads to process`);
  console.log("");

  let processed = 0;
  let updated = 0;
  let created = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < uniqueRoads.length; i += batchSize) {
    const batch = uniqueRoads.slice(i, i + batchSize);
    console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} roads)...`);

    await Promise.all(
      batch.map(async ({ entityId: eId, roadId }) => {
        try {
          // Calculate aggregates from history
          const [historyStats, recentDate] = await Promise.all([
            prisma.roadRatingHistory.aggregate({
              where: {
                entityId: eId,
                roadId: roadId,
              },
              _avg: {
                eiri: true,
              },
              _count: {
                surveyId: true,
              },
              _sum: {
                anomaliesCount: true,
              },
            }),
            prisma.roadRatingHistory.findFirst({
              where: {
                entityId: eId,
                roadId: roadId,
                surveyId: { not: null },
              },
              orderBy: {
                createdAt: "desc",
              },
              select: {
                createdAt: true,
              },
            }),
          ]);

          // Count distinct surveys
          const distinctSurveys = await prisma.roadRatingHistory.findMany({
            where: {
              entityId: eId,
              roadId: roadId,
              surveyId: { not: null },
            },
            select: {
              surveyId: true,
            },
            distinct: ["surveyId"],
          });

          // Count distinct users
          const distinctUsers = await prisma.roadRatingHistory.findMany({
            where: {
              entityId: eId,
              roadId: roadId,
            },
            select: {
              userId: true,
            },
            distinct: ["userId"],
          });

          const totalSurveys = distinctSurveys.length;
          const totalAnomalies = historyStats._sum.anomaliesCount ?? 0;
          const uniqueUsers = distinctUsers.length;
          const averageEiri = historyStats._avg.eiri ?? null;
          const lastSurveyDate = recentDate?.createdAt ?? null;

          if (!dryRun) {
            // Upsert RoadRating with calculated aggregates
            await prisma.roadRating.upsert({
              where: {
                entityId_roadId: {
                  entityId: eId,
                  roadId: roadId,
                },
              },
              create: {
                entityId: eId,
                roadId: roadId,
                eiri: averageEiri ?? 0,
                totalSurveys: totalSurveys,
                totalAnomalies: totalAnomalies,
                uniqueUsers: uniqueUsers,
                lastSurveyDate: lastSurveyDate,
              },
              update: {
                eiri: averageEiri ?? 0,
                totalSurveys: totalSurveys,
                totalAnomalies: totalAnomalies,
                uniqueUsers: uniqueUsers,
                lastSurveyDate: lastSurveyDate,
              },
            });
          }

          processed++;
          const existing = await prisma.roadRating.findUnique({
            where: {
              entityId_roadId: {
                entityId: eId,
                roadId: roadId,
              },
            },
          });

          if (existing) {
            updated++;
          } else {
            created++;
          }

          if (processed % 10 === 0) {
            console.log(`   ✓ Processed ${processed}/${uniqueRoads.length} roads...`);
          }
        } catch (error: any) {
          errors++;
          console.error(`   ✗ Error processing road ${roadId} (entity: ${eId}): ${error?.message || error}`);
        }
      })
    );
  }

  console.log("");
  console.log("✅ Backfill complete!");
  console.log(`   Processed: ${processed} roads`);
  console.log(`   Created: ${created} new RoadRating entries`);
  console.log(`   Updated: ${updated} existing RoadRating entries`);
  console.log(`   Errors: ${errors}`);
  console.log("");

  if (dryRun) {
    console.log("⚠️  DRY RUN - No changes were made to the database");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    entityId: undefined,
    dryRun: args.includes("--dry-run"),
    batchSize: 100,
  };

  // Parse entityId
  const entityIdIndex = args.indexOf("--entityId");
  if (entityIdIndex !== -1 && args[entityIdIndex + 1]) {
    options.entityId = args[entityIdIndex + 1];
  }

  // Parse batch size
  const batchSizeIndex = args.indexOf("--batch-size");
  if (batchSizeIndex !== -1 && args[batchSizeIndex + 1]) {
    const batchSize = parseInt(args[batchSizeIndex + 1], 10);
    if (!isNaN(batchSize) && batchSize > 0) {
      options.batchSize = batchSize;
    }
  }

  try {
    await backfillRoadRatingAggregates(options);
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
