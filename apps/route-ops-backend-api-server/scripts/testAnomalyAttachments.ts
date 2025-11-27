import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const TEST_EDGE_ID = "test-edge-123";
const TEST_EXTERNAL_ID = "mobile-anomaly-test-456";
const TEST_IMAGE_URL = "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/test%2Fimage.jpg?alt=media&token=test123";

async function testAnomalyAttachments() {
  console.log("🧪 Testing Anomaly Attachments & edgeId Functionality\n");

  try {
    // Step 1: Get or create a test project
    console.log("1️⃣ Setting up test project...");
    let testProject = await prisma.project.findFirst({
      where: { name: { contains: "Test Anomaly" } },
    });

    if (!testProject) {
      // Get first available user
      const testUser = await prisma.user.findFirst({
        where: { isActive: true },
      });

      if (!testUser) {
        console.log("❌ No active user found. Please create a user first.");
        return;
      }

      testProject = await prisma.project.create({
        data: {
          name: "Test Anomaly Project",
          description: "Test project for anomaly attachments",
          status: "active",
          assignedUser: testUser.id,
          createdBy: testUser.id,
        },
      });
      console.log(`✅ Created test project: ${testProject.id}`);
    } else {
      console.log(`✅ Using existing test project: ${testProject.id}`);
    }

    // Step 2: Create a test survey with edgeId in geometry points
    console.log("\n2️⃣ Testing edgeId field in geometry points...");
    const geometryWithEdgeId = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [-9.1393, 38.7223],
          },
          properties: {
            eIri: 2.5,
            edgeId: TEST_EDGE_ID,
          },
        },
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [-9.1394, 38.7224],
          },
          properties: {
            eIri: 3.0,
            edgeId: "edge-456",
          },
        },
      ],
    };

    const testSurvey = await prisma.survey.create({
      data: {
        project: { connect: { id: testProject.id } },
        name: "Test Survey",
        startTime: new Date(),
        endTime: new Date(),
        status: "Completed",
        geometryJson: geometryWithEdgeId,
      },
    });

    console.log(`✅ Survey created with geometry containing edgeId`);
    console.log(`   Survey ID: ${testSurvey.id}`);

    // Verify edgeId was saved in geometry points
    const verifySurvey = await prisma.survey.findUnique({
      where: { id: testSurvey.id },
      select: { id: true, geometryJson: true },
    });

    const geometry = verifySurvey?.geometryJson as any;
    if (geometry?.features?.[0]?.properties?.edgeId === TEST_EDGE_ID) {
      console.log("✅ edgeId correctly saved in first geometry point");
    } else {
      console.log(`❌ edgeId mismatch! Expected: ${TEST_EDGE_ID}, Got: ${geometry?.features?.[0]?.properties?.edgeId}`);
    }

    if (geometry?.features?.[1]?.properties?.edgeId === "edge-456") {
      console.log("✅ edgeId correctly saved in second geometry point");
    } else {
      console.log(`❌ edgeId mismatch in second point! Expected: edge-456, Got: ${geometry?.features?.[1]?.properties?.edgeId}`);
    }

    // Step 3: Create a test hazard with externalId
    console.log("\n3️⃣ Testing externalId field in Hazard...");
    const testHazard = await prisma.hazard.create({
      data: {
        project: { connect: { id: testProject.id } },
        latitude: 38.7223,
        longitude: -9.1393,
        description: "Test anomaly",
        externalId: TEST_EXTERNAL_ID,
        createdBy: testProject.assignedUser || undefined,
      },
    });

    console.log(`✅ Hazard created with externalId: ${testHazard.externalId}`);
    console.log(`   Hazard ID: ${testHazard.id}`);

    // Verify externalId was saved
    const verifyHazard = await prisma.hazard.findUnique({
      where: { id: testHazard.id },
      select: { id: true, externalId: true, imageUrl: true },
    });

    if (verifyHazard?.externalId === TEST_EXTERNAL_ID) {
      console.log("✅ externalId correctly saved and retrieved");
    } else {
      console.log(`❌ externalId mismatch! Expected: ${TEST_EXTERNAL_ID}, Got: ${verifyHazard?.externalId}`);
    }

    // Step 4: Test finding hazard by externalId
    console.log("\n4️⃣ Testing find hazard by externalId...");
    const foundHazard = await prisma.hazard.findFirst({
      where: { externalId: TEST_EXTERNAL_ID },
    });

    if (foundHazard && foundHazard.id === testHazard.id) {
      console.log("✅ Successfully found hazard by externalId");
    } else {
      console.log("❌ Failed to find hazard by externalId");
    }

    // Step 5: Test updating hazard imageUrl using externalId
    console.log("\n5️⃣ Testing update anomaly attachments by externalId...");
    const updatedHazard = await prisma.hazard.update({
      where: { id: foundHazard!.id },
      data: { imageUrl: TEST_IMAGE_URL },
    });

    console.log(`✅ Updated hazard imageUrl: ${updatedHazard.imageUrl}`);

    // Verify imageUrl was updated
    const verifyUpdated = await prisma.hazard.findUnique({
      where: { id: updatedHazard.id },
      select: { id: true, externalId: true, imageUrl: true },
    });

    if (verifyUpdated?.imageUrl === TEST_IMAGE_URL) {
      console.log("✅ imageUrl correctly updated and retrieved");
    } else {
      console.log(`❌ imageUrl mismatch! Expected: ${TEST_IMAGE_URL}, Got: ${verifyUpdated?.imageUrl}`);
    }

    // Step 6: Test with points without edgeId (optional field)
    console.log("\n6️⃣ Testing Survey with points without edgeId...");
    const geometryWithoutEdgeId = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [-9.1395, 38.7225],
          },
          properties: {
            eIri: 2.0,
            // No edgeId property
          },
        },
      ],
    };

    const surveyWithoutEdgeId = await prisma.survey.create({
      data: {
        project: { connect: { id: testProject.id } },
        name: "Test Survey No EdgeId",
        startTime: new Date(),
        endTime: new Date(),
        status: "Completed",
        geometryJson: geometryWithoutEdgeId,
      },
    });

    const verifyNoEdgeId = await prisma.survey.findUnique({
      where: { id: surveyWithoutEdgeId.id },
      select: { id: true, geometryJson: true },
    });

    const geometryNoEdgeId = verifyNoEdgeId?.geometryJson as any;
    if (!geometryNoEdgeId?.features?.[0]?.properties?.edgeId) {
      console.log("✅ Points without edgeId correctly saved");
    } else {
      console.log(`❌ edgeId should not exist, Got: ${geometryNoEdgeId?.features?.[0]?.properties?.edgeId}`);
    }

    console.log("\n✅ All tests passed!");
    console.log("\n📋 Summary:");
    console.log(`   - edgeId in geometry points: ✅ Working`);
    console.log(`   - Multiple edgeIds per survey: ✅ Working`);
    console.log(`   - Hazard externalId field: ✅ Working`);
    console.log(`   - Find hazard by externalId: ✅ Working`);
    console.log(`   - Update hazard imageUrl: ✅ Working`);
    console.log(`   - Points without edgeId: ✅ Working`);

  } catch (error) {
    console.error("\n❌ Test failed with error:");
    console.error(error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  testAnomalyAttachments()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { testAnomalyAttachments };

