import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

if (require.main === module) {
  dotenv.config();

  findProjectsWithVideoMetadata().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function findProjectsWithVideoMetadata() {
  console.info("🔍 Searching for projects with video metadata...");
  console.info("");

  const client = new PrismaClient();

  try {
    // Find projects that have video metadata
    const projects = await client.project.findMany({
      where: {
        videoMetadata: {
          some: {},
        },
      },
      select: {
        id: true,
        name: true,
        videoUrl: true,
        status: true,
        createdAt: true,
        cityHall: {
          select: {
            id: true,
            name: true,
          },
        },
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
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10, // Get up to 10 projects
    });

    if (projects.length === 0) {
      console.info("❌ No projects with video metadata found.");
      console.info("");
      console.info("💡 To create test data, you can:");
      console.info("   1. Use the mobile endpoint POST /mobile/project/end");
      console.info("   2. Include videoUrl and videoMetadata in the payload");
      console.info("   3. Or run: npm run test:video-metadata (but it cleans up after)");
    } else {
      console.info(`✅ Found ${projects.length} project(s) with video metadata:\n`);

      projects.forEach((project, index) => {
        console.info(`📦 Project ${index + 1}:`);
        console.info(`   ID: ${project.id}`);
        console.info(`   Name: ${project.name || "N/A"}`);
        console.info(`   Status: ${project.status || "N/A"}`);
        console.info(`   Video URL: ${project.videoUrl || "N/A"}`);
        console.info(`   CityHall: ${project.cityHall?.name || "N/A"}`);
        console.info(`   Created: ${project.createdAt}`);
        console.info(`   Video Metadata Entries: ${project.videoMetadata.length}`);
        
        if (project.videoMetadata.length > 0) {
          console.info(`   First entry: videoTime=${project.videoMetadata[0].videoTime}s, lat=${project.videoMetadata[0].lat}, lng=${project.videoMetadata[0].lng}`);
          if (project.videoMetadata.length > 1) {
            console.info(`   Last entry: videoTime=${project.videoMetadata[project.videoMetadata.length - 1].videoTime}s, lat=${project.videoMetadata[project.videoMetadata.length - 1].lat}, lng=${project.videoMetadata[project.videoMetadata.length - 1].lng}`);
          }
        }

        if (project.surveys.length > 0) {
          const survey = project.surveys[0];
          console.info(`   Survey: startTime=${survey.startTime}, endTime=${survey.endTime}`);
        }

        console.info("");
      });

      // Highlight the first project for easy copy
      console.info("🎯 Use this project ID for testing:");
      console.info(`   ${projects[0].id}`);
      console.info("");
    }
  } catch (error) {
    console.error("❌ Error searching for projects:", error);
    throw error;
  } finally {
    await client.$disconnect();
  }
}

