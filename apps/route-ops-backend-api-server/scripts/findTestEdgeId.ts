import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function findTestEdgeId() {
  try {
    console.log("🔍 Searching for edgeIds with survey data...\n");

    // Find all surveys that have edgeIds
    const surveys = await prisma.survey.findMany({
      where: {
        edgeIds: {
          isEmpty: false,
        },
      },
      select: {
        id: true,
        name: true,
        projectId: true,
        edgeIds: true,
        eIriAvg: true,
        startTime: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (surveys.length === 0) {
      console.log("❌ No surveys found with edgeIds populated.");
      console.log("💡 You may need to run the backfill script or create surveys with edgeIds.");
      return;
    }

    console.log(`✅ Found ${surveys.length} survey(s) with edgeIds\n`);

    // Collect all unique edgeIds and count surveys per edgeId
    const edgeIdStats: Record<
      string,
      {
        surveyCount: number;
        surveyIds: string[];
        projectIds: string[];
        anomalyCount: number;
        anomalyIds: string[];
      }
    > = {};

    for (const survey of surveys) {
      if (survey.edgeIds && survey.edgeIds.length > 0) {
        for (const edgeId of survey.edgeIds) {
          if (!edgeIdStats[edgeId]) {
            edgeIdStats[edgeId] = {
              surveyCount: 0,
              surveyIds: [],
              projectIds: [],
              anomalyCount: 0,
              anomalyIds: [],
            };
          }
          edgeIdStats[edgeId].surveyCount++;
          edgeIdStats[edgeId].surveyIds.push(survey.id);
          if (survey.projectId) {
            edgeIdStats[edgeId].projectIds.push(survey.projectId);
          }
        }
      }
    }

    // Find hazards (anomalies) for each edgeId
    for (const edgeId of Object.keys(edgeIdStats)) {
      const hazards = await prisma.hazard.findMany({
        where: {
          edgeId: edgeId,
        },
        select: {
          id: true,
          projectId: true,
        },
      });

      edgeIdStats[edgeId].anomalyCount = hazards.length;
      edgeIdStats[edgeId].anomalyIds = hazards.map((h) => h.id);
    }

    // Sort by survey count (descending) and anomaly count (descending)
    const sortedEdgeIds = Object.entries(edgeIdStats).sort((a, b) => {
      if (b[1].surveyCount !== a[1].surveyCount) {
        return b[1].surveyCount - a[1].surveyCount;
      }
      return b[1].anomalyCount - a[1].anomalyCount;
    });

    console.log("📊 EdgeId Statistics:\n");
    console.log("=" .repeat(80));

    for (const [edgeId, stats] of sortedEdgeIds) {
      console.log(`\n🛣️  EdgeId: ${edgeId}`);
      console.log(`   📈 Surveys: ${stats.surveyCount}`);
      console.log(`   ⚠️  Anomalies: ${stats.anomalyCount}`);
      console.log(`   📋 Survey IDs: ${stats.surveyIds.join(", ")}`);
      if (stats.anomalyIds.length > 0) {
        console.log(`   🚨 Anomaly IDs: ${stats.anomalyIds.slice(0, 5).join(", ")}${stats.anomalyIds.length > 5 ? "..." : ""}`);
      }
      console.log(`   🏗️  Project IDs: ${[...new Set(stats.projectIds)].join(", ")}`);
    }

    // Find the best edgeId for testing (has at least 1 survey and preferably anomalies)
    const bestEdgeId = sortedEdgeIds.find(
      ([, stats]) => stats.surveyCount >= 1
    );

    if (bestEdgeId) {
      const [edgeId, stats] = bestEdgeId;
      console.log("\n" + "=".repeat(80));
      console.log("\n✨ RECOMMENDED EDGEID FOR TESTING:\n");
      console.log(`   EdgeId: ${edgeId}`);
      console.log(`   ✅ Has ${stats.surveyCount} survey(s)`);
      console.log(`   ${stats.anomalyCount > 0 ? "✅" : "⚠️"} Has ${stats.anomalyCount} anomaly/anomalies`);
      console.log(`\n   📝 Use this in your frontend:`);
      console.log(`   GET /api/roads/nearest-edge?lat=XX&lng=YY&radiusMeters=200`);
      console.log(`   GET /api/surveys/edge-analytics/${edgeId}`);
      console.log(`\n   📍 Survey Details:`);
      
      // Get full survey details
      const surveyDetails = await prisma.survey.findMany({
        where: {
          id: { in: stats.surveyIds },
        },
        select: {
          id: true,
          name: true,
          projectId: true,
          eIriAvg: true,
          startTime: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      for (const survey of surveyDetails) {
        console.log(`      - Survey ID: ${survey.id}`);
        console.log(`        Name: ${survey.name || "N/A"}`);
        console.log(`        Project: ${survey.project?.name || "N/A"} (${survey.projectId})`);
        console.log(`        eIRI: ${survey.eIriAvg || "N/A"}`);
        console.log(`        Start Time: ${survey.startTime || "N/A"}`);
      }

      if (stats.anomalyIds.length > 0) {
        console.log(`\n   🚨 Anomaly Details:`);
        const anomalyDetails = await prisma.hazard.findMany({
          where: {
            id: { in: stats.anomalyIds.slice(0, 5) },
          },
          select: {
            id: true,
            typeField: true,
            severity: true,
            projectId: true,
          },
        });

        for (const anomaly of anomalyDetails) {
          console.log(`      - Anomaly ID: ${anomaly.id}`);
          console.log(`        Type: ${anomaly.typeField || "N/A"}`);
          console.log(`        Severity: ${anomaly.severity || "N/A"}`);
        }
      }
    } else {
      console.log("\n❌ No suitable edgeId found for testing.");
    }

    console.log("\n" + "=".repeat(80));
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

findTestEdgeId();

