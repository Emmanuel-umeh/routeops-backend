import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

if (require.main === module) {
  dotenv.config();

  const { BCRYPT_SALT } = process.env;

  if (!BCRYPT_SALT) {
    throw new Error("BCRYPT_SALT environment variable must be defined");
  }
  const salt = parseSalt(BCRYPT_SALT);

  testVideoMetadata(salt).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function testVideoMetadata(bcryptSalt: Salt) {
  console.info("🧪 Testing Video Metadata Implementation...");
  console.info("");

  const client = new PrismaClient();

  try {
    // Step 1: Create a test user
    console.info("📝 Step 1: Creating test user...");
    const testUser = await client.user.upsert({
      where: { username: "test_video_user" },
      update: {},
      create: {
        username: "test_video_user",
        password: await hash("test123", bcryptSalt),
        role: "app_user" as const,
        roles: ["app_user"],
        email: "test_video@routeops.com",
        firstName: "Test",
        lastName: "Video User",
        isActive: true,
      },
    });
    console.info(`✅ Test user created: ${testUser.username} (${testUser.id})`);
    console.info("");

    // Step 2: Get or create a test CityHall
    console.info("📝 Step 2: Getting test CityHall...");
    const cityHall = await client.cityHall.findFirst({
      where: { name: "Infralobo" },
    });

    if (!cityHall) {
      throw new Error("CityHall 'Infralobo' not found. Please run setup:production first.");
    }
    console.info(`✅ Using CityHall: ${cityHall.name} (${cityHall.id})`);
    console.info("");

    // Step 3: Create a test project
    console.info("📝 Step 3: Creating test project...");
    const testProject = await client.project.create({
      data: {
        name: "Test Video Metadata Project",
        description: "Test project for video metadata feature",
        status: "active" as const,
        createdBy: testUser.id,
        cityHall: { connect: { id: cityHall.id } },
      },
    });
    console.info(`✅ Test project created: ${testProject.name} (${testProject.id})`);
    console.info("");

    // Step 4: Simulate endProject with video metadata
    console.info("📝 Step 4: Testing endProject with video metadata...");
    const startDate = new Date("2024-01-23T10:30:00Z");
    const endDate = new Date("2024-01-23T14:30:00Z");
    const videoUrl = "https://storage.example.com/test-video.mp4";
    const videoMetadata = [
      { videoTime: 10, lat: 37.060899, lng: -8.064873 },
      { videoTime: 20, lat: 37.061000, lng: -8.064900 },
      { videoTime: 30, lat: 37.061100, lng: -8.064950 },
      { videoTime: 40, lat: 37.061200, lng: -8.065000 },
    ];

    // Create a simple survey
    const testSurvey = await client.survey.create({
      data: {
        project: { connect: { id: testProject.id } },
        name: "Test Survey",
        startTime: startDate,
        endTime: endDate,
        status: "Completed",
        geometryJson: {
          type: "FeatureCollection",
          features: [],
        },
        edgeIds: [],
      } as any,
    });
    console.info(`✅ Test survey created: ${testSurvey.id}`);
    console.info(`   Start time: ${testSurvey.startTime}`);
    console.info(`   End time: ${testSurvey.endTime}`);

    // Update project with video URL
    await client.project.update({
      where: { id: testProject.id },
      data: { videoUrl, status: "completed" },
    });
    console.info(`✅ Project updated with video URL: ${videoUrl}`);

    // Save video metadata
    await client.videoMetadata.deleteMany({
      where: { projectId: testProject.id },
    });

    await client.videoMetadata.createMany({
      data: videoMetadata.map((meta) => ({
        projectId: testProject.id,
        videoTime: meta.videoTime,
        lat: meta.lat,
        lng: meta.lng,
      })),
    });
    console.info(`✅ Video metadata saved: ${videoMetadata.length} entries`);
    console.info("");

    // Step 5: Verify the data
    console.info("📝 Step 5: Verifying saved data...");
    const savedProject = await client.project.findUnique({
      where: { id: testProject.id },
      select: {
        id: true,
        name: true,
        videoUrl: true,
        status: true,
        videoMetadata: {
          select: {
            id: true,
            videoTime: true,
            lat: true,
            lng: true,
            createdAt: true,
          },
          orderBy: {
            videoTime: "asc",
          },
        },
        surveys: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    if (!savedProject) {
      throw new Error("Project not found after creation");
    }

    console.info("✅ Project verification:");
    console.info(`   ID: ${savedProject.id}`);
    console.info(`   Name: ${savedProject.name}`);
    console.info(`   Video URL: ${savedProject.videoUrl}`);
    console.info(`   Status: ${savedProject.status}`);
    console.info(`   Video Metadata entries: ${savedProject.videoMetadata.length}`);
    console.info(`   Survey count: ${savedProject.surveys.length}`);

    if (savedProject.surveys.length > 0) {
      const survey = savedProject.surveys[0];
      console.info(`   Survey start time: ${survey.startTime}`);
      console.info(`   Survey end time: ${survey.endTime}`);
      if (survey.startTime && survey.endTime) {
        const startMatch = survey.startTime.getTime() === startDate.getTime();
        const endMatch = survey.endTime.getTime() === endDate.getTime();
        console.info(`   ✅ Survey times match: start=${startMatch}, end=${endMatch}`);
      } else {
        console.error(`   ❌ Survey times are null`);
      }
    }

    if (savedProject.videoMetadata.length === videoMetadata.length) {
      console.info("✅ Video metadata verification:");
      for (let i = 0; i < savedProject.videoMetadata.length; i++) {
        const saved = savedProject.videoMetadata[i];
        const expected = videoMetadata[i];
        const match =
          saved.videoTime === expected.videoTime &&
          saved.lat === expected.lat &&
          saved.lng === expected.lng;
        console.info(
          `   Entry ${i + 1}: ${match ? "✅" : "❌"} videoTime=${saved.videoTime}, lat=${saved.lat}, lng=${saved.lng}`
        );
      }
    } else {
      console.error(`❌ Video metadata count mismatch: expected ${videoMetadata.length}, got ${savedProject.videoMetadata.length}`);
    }

    console.info("");
    console.info("🎉 Test completed successfully!");
    console.info("");

    // Step 6: Clean up test data
    console.info("📝 Step 6: Cleaning up test data...");
    await client.videoMetadata.deleteMany({
      where: { projectId: testProject.id },
    });
    console.info("✅ Video metadata deleted");

    await client.survey.deleteMany({
      where: { projectId: testProject.id },
    });
    console.info("✅ Surveys deleted");

    await client.project.delete({
      where: { id: testProject.id },
    });
    console.info("✅ Project deleted");

    await client.user.delete({
      where: { id: testUser.id },
    });
    console.info("✅ Test user deleted");

    console.info("");
    console.info("✨ All test data cleaned up successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  } finally {
    await client.$disconnect();
  }
}




