import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function createTestEdgeIdWithAnomalies() {
  try {
    console.log("🔍 Finding an edgeId with survey data...\n");

    // Find a survey with edgeIds
    const survey = await prisma.survey.findFirst({
      where: {
        edgeIds: {
          isEmpty: false,
        },
      },
      include: {
        project: true,
      },
    });

    if (!survey) {
      console.log("❌ No surveys found with edgeIds. Please run seed scripts first.");
      return;
    }

    // Use the first edgeId from the survey
    const testEdgeId = survey.edgeIds[0];
    console.log(`✅ Found edgeId: ${testEdgeId} from survey ${survey.id}\n`);

    // Check if there are already hazards with this edgeId
    const existingHazards = await prisma.hazard.findMany({
      where: {
        edgeId: testEdgeId,
      },
    });

    if (existingHazards.length > 0) {
      console.log(`✅ EdgeId ${testEdgeId} already has ${existingHazards.length} anomaly/anomalies!\n`);
      console.log("📊 Summary:");
      console.log(`   EdgeId: ${testEdgeId}`);
      console.log(`   Surveys: 1`);
      console.log(`   Anomalies: ${existingHazards.length}`);
      console.log(`\n   📝 Use this in your frontend:`);
      console.log(`   GET /api/surveys/edge-analytics/${testEdgeId}`);
      return;
    }

    console.log(`⚠️  No anomalies found for edgeId ${testEdgeId}. Creating test anomalies...\n`);

    // Create a few test hazards (anomalies) for this edgeId
    const hazards = await prisma.hazard.createMany({
      data: [
        {
          projectId: survey.projectId,
          edgeId: testEdgeId,
          typeField: "pothole",
          severity: "high",
          description: "Test anomaly 1 - Large pothole",
          latitude: 38.7223,
          longitude: -9.1393,
        },
        {
          projectId: survey.projectId,
          edgeId: testEdgeId,
          typeField: "crack",
          severity: "medium",
          description: "Test anomaly 2 - Surface crack",
          latitude: 38.7224,
          longitude: -9.1394,
        },
        {
          projectId: survey.projectId,
          edgeId: testEdgeId,
          typeField: "deterioration",
          severity: "low",
          description: "Test anomaly 3 - Road deterioration",
          latitude: 38.7225,
          longitude: -9.1395,
        },
      ],
    });

    console.log(`✅ Created ${hazards.count} test anomalies for edgeId ${testEdgeId}\n`);

    // Verify
    const allHazards = await prisma.hazard.findMany({
      where: {
        edgeId: testEdgeId,
      },
    });

    console.log("📊 Summary:");
    console.log(`   EdgeId: ${testEdgeId}`);
    console.log(`   Surveys: 1`);
    console.log(`   Anomalies: ${allHazards.length}`);
    console.log(`\n   📝 Use this in your frontend:`);
    console.log(`   GET /api/surveys/edge-analytics/${testEdgeId}`);
    console.log(`\n   🚨 Anomaly IDs:`);
    allHazards.forEach((hazard, index) => {
      console.log(`      ${index + 1}. ${hazard.id} - ${hazard.typeField} (${hazard.severity})`);
    });
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestEdgeIdWithAnomalies();

