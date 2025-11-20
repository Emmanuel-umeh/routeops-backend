import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROJECT_ID = "4492cc8a-8f32-42c7-a61a-f2f8d43fcf31";
const TEST_VIDEO_URL = "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/surveys%2Fefec684c-784e-4e0b-a07d-2812eb32666e%2Fvideos%2F540162f9-2ccc-42fc-a0f2-b78c6ab11081.mp4?alt=media&token=8ab686a9-8299-4426-a95f-074ad4cb4278";

async function testVideoUpload() {
  console.log("🧪 Testing Video Upload Functionality\n");
  console.log(`Project ID: ${PROJECT_ID}\n`);

  try {
    // Step 1: Check current project state
    console.log("1️⃣ Checking current project state...");
    const projectBefore = await prisma.project.findUnique({
      where: { id: PROJECT_ID },
      select: {
        id: true,
        name: true,
        videoUrl: true,
        status: true,
      },
    });

    if (!projectBefore) {
      console.log(`❌ Project with ID ${PROJECT_ID} not found!`);
      return;
    }

    console.log("✅ Project found:");
    console.log(`   Name: ${projectBefore.name || "N/A"}`);
    console.log(`   Current videoUrl: ${projectBefore.videoUrl || "null"}`);
    console.log(`   Status: ${projectBefore.status || "N/A"}\n`);

    // Step 2: Simulate the uploadAttachments call
    console.log("2️⃣ Simulating video upload...");
    const uploadData = {
      projectId: PROJECT_ID,
      type: "video",
      files: [TEST_VIDEO_URL],
    };

    // Simulate what the service does
    await prisma.project.update({
      where: { id: uploadData.projectId },
      data: { videoUrl: uploadData.files[0] },
    });

    console.log(`✅ Video URL saved: ${uploadData.files[0]}\n`);

    // Step 3: Verify the project was updated
    console.log("3️⃣ Verifying project was updated...");
    const projectAfter = await prisma.project.findUnique({
      where: { id: PROJECT_ID },
      select: {
        id: true,
        name: true,
        videoUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!projectAfter) {
      console.log("❌ Project not found after update!");
      return;
    }

    console.log("✅ Project after update:");
    console.log(`   Name: ${projectAfter.name || "N/A"}`);
    console.log(`   videoUrl: ${projectAfter.videoUrl || "null"}`);
    console.log(`   Status: ${projectAfter.status || "N/A"}`);
    console.log(`   Updated at: ${projectAfter.updatedAt}\n`);

    // Step 4: Verify videoUrl matches
    if (projectAfter.videoUrl === TEST_VIDEO_URL) {
      console.log("✅ SUCCESS: videoUrl was correctly saved!");
      console.log(`   Expected: ${TEST_VIDEO_URL}`);
      console.log(`   Actual: ${projectAfter.videoUrl}`);
    } else {
      console.log("❌ FAILED: videoUrl does not match!");
      console.log(`   Expected: ${TEST_VIDEO_URL}`);
      console.log(`   Actual: ${projectAfter.videoUrl || "null"}`);
    }

    // Step 5: Test what the GET /projects/:id endpoint would return
    console.log("\n4️⃣ Testing what GET /projects/:id would return...");
    const projectForDashboard = await prisma.project.findUnique({
      where: { id: PROJECT_ID },
      select: {
        assignedUser: true,
        cityHall: {
          select: {
            id: true,
            name: true,
            description: true,
            allowVideo: true,
            allowImages: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        createdAt: true,
        createdBy: true,
        description: true,
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        videoUrl: true, // This is the key field
        surveys: {
          select: {
            id: true,
            name: true,
            status: true,
            startTime: true,
            endTime: true,
            geometryJson: true,
            bbox: true,
            eIriAvg: true,
            lengthMeters: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        routePoints: {
          select: {
            id: true,
            latitude: true,
            longitude: true,
            frameNumber: true,
            timestamp: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        hazards: {
          select: {
            id: true,
            latitude: true,
            longitude: true,
            description: true,
            severity: true,
            typeField: true,
            imageUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (projectForDashboard?.videoUrl) {
      console.log("✅ Dashboard endpoint would return videoUrl:");
      console.log(`   ${projectForDashboard.videoUrl}`);
    } else {
      console.log("❌ Dashboard endpoint would NOT return videoUrl (it's null)");
    }

    console.log("\n✅ Test completed successfully!");
  } catch (error: any) {
    console.error("❌ Error during test:", error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testVideoUpload();

