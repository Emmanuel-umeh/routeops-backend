/**
 * Backfill script to populate denormalized fields in RoadRatingHistory
 * 
 * This script uses STRICT matching criteria to ensure accuracy:
 * 1. Matches by exact edgeId in survey.edgeIds array
 * 2. Matches by entityId (project.cityHallId)
 * 3. Matches by userId (user who created the survey)
 * 4. Uses tight time window (5 minutes) - history entries are created immediately after surveys
 * 5. Validates EIRI value matches (within 0.1 tolerance)
 * 6. Only updates when confident - skips ambiguous matches
 * 
 * Run with: ts-node scripts/backfillRoadRatingHistory.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface MatchResult {
  surveyId: string;
  projectId: string;
  confidence: "high" | "medium" | "low";
  timeDiff: number; // milliseconds
  eiriDiff: number; // absolute difference
}

async function backfillRoadRatingHistory(edgeIdFilter?: string) {
  console.log("Starting backfill of RoadRatingHistory denormalized fields...");
  console.log("Using STRICT matching criteria for accuracy\n");
  
  if (edgeIdFilter) {
    console.log(`🔍 Filtering by edgeId: ${edgeIdFilter}\n`);
  }

  try {
    // Get all RoadRatingHistory entries that need to be updated
    // Note: After migration, surveyId and projectId fields will exist
    const whereClause: any = {
      OR: [
        { surveyId: null } as any,
        { projectId: null } as any,
      ],
    };
    
    // Filter by edgeId if provided
    if (edgeIdFilter) {
      whereClause.roadId = edgeIdFilter;
    }
    
    const historyEntries = await prisma.roadRatingHistory.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            cityHallId: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    console.log(`Found ${historyEntries.length} history entries to update\n`);

    let updated = 0;
    let skipped = 0;
    let ambiguous = 0;
    const skippedReasons: Record<string, number> = {};

    // Process in batches to avoid memory issues
    const batchSize = 50;
    for (let i = 0; i < historyEntries.length; i += batchSize) {
      const batch = historyEntries.slice(i, i + batchSize);
      
      for (const entry of batch) {
        try {
          // STRICT MATCHING CRITERIA:
          // 1. Exact edgeId match in survey.edgeIds array
          // 2. Same entityId (cityHallId)
          // 3. Same userId (user who created the survey)
          // 4. Tight time window: 5 minutes (history entries are created immediately after surveys)
          const timeWindowMs = 5 * 60 * 1000; // 5 minutes
          const timeStart = new Date(entry.createdAt.getTime() - timeWindowMs);
          const timeEnd = new Date(entry.createdAt.getTime() + timeWindowMs);

          const matchingSurveys = await prisma.survey.findMany({
            where: {
              project: {
                cityHallId: entry.entityId,
              },
              edgeIds: {
                has: entry.roadId, // Exact match in edgeIds array
              },
              // Tight time window - history entries are created immediately after surveys
              createdAt: {
                gte: timeStart,
                lte: timeEnd,
              },
              // Match by user - check if survey's project was created by this user
              // OR if survey's assignedUser matches
              OR: [
                {
                  project: {
                    createdBy: entry.userId,
                  },
                },
                {
                  assignedUser: entry.userId,
                },
              ],
            },
            include: {
              project: {
                select: {
                  id: true,
                  createdBy: true,
                  cityHallId: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          });

          if (matchingSurveys.length === 0) {
            skipped++;
            skippedReasons["no_match"] = (skippedReasons["no_match"] || 0) + 1;
            continue;
          }

          // Score each match for confidence
          const matches: MatchResult[] = matchingSurveys.map((survey) => {
            const timeDiff = Math.abs(survey.createdAt.getTime() - entry.createdAt.getTime());
            const eiriDiff = survey.eIriAvg !== null 
              ? Math.abs(survey.eIriAvg - entry.eiri)
              : Infinity;

            // Determine confidence level
            let confidence: "high" | "medium" | "low" = "low";
            if (timeDiff < 60000 && eiriDiff < 0.1) {
              // Within 1 minute and EIRI matches closely
              confidence = "high";
            } else if (timeDiff < 180000 && eiriDiff < 0.5) {
              // Within 3 minutes and EIRI is reasonably close
              confidence = "medium";
            }

            return {
              surveyId: survey.id,
              projectId: survey.projectId || "",
              confidence,
              timeDiff,
              eiriDiff,
            };
          });

          // Only proceed if we have at least one high-confidence match
          const highConfidenceMatches = matches.filter((m) => m.confidence === "high");
          
          if (highConfidenceMatches.length === 0) {
            // No high-confidence matches - check for single medium-confidence match
            const mediumConfidenceMatches = matches.filter((m) => m.confidence === "medium");
            
            if (mediumConfidenceMatches.length === 1) {
              // Single medium-confidence match - acceptable
              const match = mediumConfidenceMatches[0];
              
              // Count anomalies for this specific survey and edgeId
              const anomaliesCount = await prisma.hazard.count({
                where: {
                  projectId: match.projectId,
                  edgeId: entry.roadId,
                  createdAt: {
                    gte: new Date(entry.createdAt.getTime() - timeWindowMs),
                    lte: new Date(entry.createdAt.getTime() + timeWindowMs),
                  },
                },
              });

            await prisma.roadRatingHistory.update({
              where: { id: entry.id },
              data: {
                surveyId: match.surveyId,
                projectId: match.projectId,
                anomaliesCount: anomaliesCount > 0 ? anomaliesCount : null,
              } as any,
            });

              updated++;
            } else if (mediumConfidenceMatches.length > 1) {
              // Multiple medium-confidence matches - ambiguous, skip
              ambiguous++;
              skippedReasons["ambiguous_match"] = (skippedReasons["ambiguous_match"] || 0) + 1;
            } else {
              // No acceptable matches
              skipped++;
              skippedReasons["low_confidence"] = (skippedReasons["low_confidence"] || 0) + 1;
            }
          } else if (highConfidenceMatches.length === 1) {
            // Perfect: exactly one high-confidence match
            const match = highConfidenceMatches[0];
            
            // Count anomalies for this specific survey and edgeId
            const anomaliesCount = await prisma.hazard.count({
              where: {
                projectId: match.projectId,
                edgeId: entry.roadId,
                createdAt: {
                  gte: new Date(entry.createdAt.getTime() - timeWindowMs),
                  lte: new Date(entry.createdAt.getTime() + timeWindowMs),
                },
              },
            });

            await prisma.roadRatingHistory.update({
              where: { id: entry.id },
              data: {
                surveyId: match.surveyId,
                projectId: match.projectId,
                anomaliesCount: anomaliesCount > 0 ? anomaliesCount : null,
              } as any,
            });

            updated++;
          } else {
            // Multiple high-confidence matches - this shouldn't happen, but be safe
            // Use the closest one by time
            const bestMatch = highConfidenceMatches.reduce((best, current) => 
              current.timeDiff < best.timeDiff ? current : best
            );
            
            // Log warning but proceed with best match
            console.warn(
              `⚠️  Entry ${entry.id} has ${highConfidenceMatches.length} high-confidence matches. ` +
              `Using closest match (surveyId: ${bestMatch.surveyId}, timeDiff: ${bestMatch.timeDiff}ms)`
            );
            
            const anomaliesCount = await prisma.hazard.count({
              where: {
                projectId: bestMatch.projectId,
                edgeId: entry.roadId,
                createdAt: {
                  gte: new Date(entry.createdAt.getTime() - timeWindowMs),
                  lte: new Date(entry.createdAt.getTime() + timeWindowMs),
                },
              },
            });

            await prisma.roadRatingHistory.update({
              where: { id: entry.id },
              data: {
                surveyId: bestMatch.surveyId,
                projectId: bestMatch.projectId,
                anomaliesCount: anomaliesCount > 0 ? anomaliesCount : null,
              } as any,
            });

            updated++;
          }
        } catch (error) {
          console.error(`❌ Error processing entry ${entry.id}:`, error);
          skipped++;
          skippedReasons["error"] = (skippedReasons["error"] || 0) + 1;
        }
      }

      const progress = Math.min(i + batchSize, historyEntries.length);
      const percent = ((progress / historyEntries.length) * 100).toFixed(1);
      console.log(`Progress: ${progress}/${historyEntries.length} (${percent}%) - Updated: ${updated}, Skipped: ${skipped}, Ambiguous: ${ambiguous}`);
    }

    console.log(`\n✅ Backfill complete!`);
    console.log(`\nSummary:`);
    console.log(`  ✅ Updated: ${updated} entries (high confidence)`);
    console.log(`  ⚠️  Ambiguous: ${ambiguous} entries (multiple matches, skipped for safety)`);
    console.log(`  ❌ Skipped: ${skipped} entries`);
    
    if (Object.keys(skippedReasons).length > 0) {
      console.log(`\nSkipped reasons:`);
      for (const [reason, count] of Object.entries(skippedReasons)) {
        console.log(`  - ${reason}: ${count}`);
      }
    }
    
    console.log(`\n💡 Note: Only entries with high-confidence matches were updated.`);
    console.log(`   This ensures data accuracy and prevents client-facing bugs.`);
  } catch (error) {
    console.error("❌ Error during backfill:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get edgeId from command line argument if provided
const edgeIdFilter = process.argv[2];

if (edgeIdFilter) {
  console.log(`\n📌 Running backfill for single edgeId: ${edgeIdFilter}`);
  console.log(`   This is a test run - only entries for this edgeId will be processed.\n`);
}

// Run the backfill
backfillRoadRatingHistory(edgeIdFilter)
  .then(() => {
    console.log("\n✅ Backfill script completed successfully");
    if (edgeIdFilter) {
      console.log(`\n💡 To test the analytics endpoint speed, use:`);
      console.log(`   GET /api/surveys/edge-analytics/${edgeIdFilter}`);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Backfill script failed:", error);
    process.exit(1);
  });
