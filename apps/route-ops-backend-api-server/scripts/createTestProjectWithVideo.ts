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

  createTestProjectWithVideo(salt).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function createTestProjectWithVideo(bcryptSalt: Salt) {
  console.info("🎬 Creating test project with video metadata for frontend testing...");
  console.info("");

  const client = new PrismaClient();

  try {
    // Get or create a test user
    console.info("📝 Step 1: Getting test user...");
    let testUser = await client.user.findFirst({
      where: { username: "test_video_user" },
    });

    if (!testUser) {
      testUser = await client.user.create({
        data: {
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
      console.info(`✅ Test user created: ${testUser.username}`);
    } else {
      console.info(`✅ Using existing test user: ${testUser.username}`);
    }
    console.info("");

    // Get a CityHall
    console.info("📝 Step 2: Getting CityHall...");
    const cityHall = await client.cityHall.findFirst({
      where: { name: "Infralobo" },
    });

    if (!cityHall) {
      throw new Error("CityHall 'Infralobo' not found. Please run setup:production first.");
    }
    console.info(`✅ Using CityHall: ${cityHall.name}`);
    console.info("");

    // Create test project
    console.info("📝 Step 3: Creating test project with video metadata...");
    const startDate = new Date("2024-01-23T10:30:00Z");
    const endDate = new Date("2024-01-23T14:30:00Z");
    const videoUrl = "https://storage.example.com/test-video.mp4";
    
    // Create realistic video metadata (every 10 seconds for a 2-minute video)
    const videoMetadata = [];
    const baseLat = 37.060899;
    const baseLng = -8.064873;
    for (let i = 0; i <= 120; i += 10) {
      // Simulate movement along a path
      videoMetadata.push({
        videoTime: i,
        lat: baseLat + (i * 0.0001), // Moving north
        lng: baseLng + (i * 0.0001), // Moving east
      });
    }

    // Create project
    const testProject = await client.project.create({
      data: {
        name: "Frontend Test Project - Video Metadata",
        description: "Test project with video metadata for frontend testing. DO NOT DELETE.",
        status: "completed" as const,
        createdBy: testUser.id,
        videoUrl: videoUrl,
        cityHall: { connect: { id: cityHall.id } },
      },
    });
    console.info(`✅ Project created: ${testProject.id}`);

    // Create survey
    const testSurvey = await client.survey.create({
      data: {
        project: { connect: { id: testProject.id } },
        name: "Test Survey with Video",
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
    console.info(`✅ Survey created: ${testSurvey.id}`);

    // Save video metadata
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

    // Verify
    const savedProject = await client.project.findUnique({
      where: { id: testProject.id },
      select: {
        id: true,
        name: true,
        videoUrl: true,
        status: true,
        videoMetadata: {
          select: {
            videoTime: true,
            lat: true,
            lng: true,
          },
          orderBy: {
            videoTime: "asc",
          },
        },
        surveys: {
          select: {
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    console.info("🎉 Test project created successfully!");
    console.info("");
    console.info("📋 Project Details:");
    console.info(`   Project ID: ${savedProject?.id}`);
    console.info(`   Name: ${savedProject?.name}`);
    console.info(`   Video URL: ${savedProject?.videoUrl}`);
    console.info(`   Status: ${savedProject?.status}`);
    console.info(`   Video Metadata Entries: ${savedProject?.videoMetadata.length}`);
    console.info(`   Survey Start: ${savedProject?.surveys[0]?.startTime}`);
    console.info(`   Survey End: ${savedProject?.surveys[0]?.endTime}`);
    console.info("");
    console.info("🎯 Use this Project ID for frontend testing:");
    console.info(`   ${savedProject?.id}`);
    console.info("");
    console.info("📊 Video Metadata Range:");
    if (savedProject?.videoMetadata && savedProject.videoMetadata.length > 0) {
      const first = savedProject.videoMetadata[0];
      const last = savedProject.videoMetadata[savedProject.videoMetadata.length - 1];
      console.info(`   Time: ${first.videoTime}s - ${last.videoTime}s`);
      console.info(`   Location: (${first.lat}, ${first.lng}) to (${last.lat}, ${last.lng})`);
    }
    console.info("");
    console.info("💡 This project will persist in the database for testing.");
  } catch (error) {
    console.error("❌ Error creating test project:", error);
    throw error;
  } finally {
    await client.$disconnect();
  }
}


