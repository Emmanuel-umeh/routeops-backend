import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Production database connection string
// Using sslmode=prefer to handle TLS connection issues
const PROD_DB_URL = "postgresql://smartroads_prod_db_user:dfMjUIECU0tvrEXqVZfbyp4KDlyJKD7E@dpg-d4rv4akhg0os73d9h4lg-a.oregon-postgres.render.com/smartroads_prod_db?sslmode=prefer";

if (require.main === module) {
  // Set the DATABASE_URL environment variable for Prisma
  process.env.DATABASE_URL = PROD_DB_URL;
  dotenv.config();

  findProjectWithSurveyAndVideo().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function findProjectWithSurveyAndVideo() {
  console.info("🔍 Looking for a project that has BOTH surveys and video metadata...\n");

  const client = new PrismaClient();

  try {
    // Find projects that have BOTH surveys AND video metadata
    const project = await client.project.findFirst({
      where: {
        AND: [
          {
            surveys: {
              some: {},
            },
          },
          {
            videoMetadata: {
              some: {},
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        cityHall: {
          select: { id: true, name: true },
        },
        surveys: {
          select: {
            id: true,
            name: true,
            status: true,
            startTime: true,
            endTime: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
          take: 5,
        },
        videoMetadata: {
          select: {
            id: true,
            videoTime: true,
            lat: true,
            lng: true,
            createdAt: true,
          },
          orderBy: { videoTime: "asc" },
          take: 5,
        },
      },
    });

    if (!project) {
      console.info("❌ No project found that has both surveys and video metadata.");
      return;
    }

    console.info("✅ Found a project with BOTH surveys and video metadata:\n");
    console.info(`Project ID: ${project.id}`);
    console.info(`Name: ${project.name || "N/A"}`);
    console.info(`Description: ${project.description || "N/A"}`);
    console.info(`Created At: ${project.createdAt}`);
    console.info(`City Hall: ${project.cityHall?.name || "N/A"} (${project.cityHall?.id || "N/A"})`);

    console.info("\n📊 Surveys (up to 5):");
    if (!project.surveys.length) {
      console.info("  None");
    } else {
      project.surveys.forEach((s, idx) => {
        console.info(`  ${idx + 1}. ID: ${s.id}`);
        console.info(`     Name: ${s.name || "N/A"}`);
        console.info(`     Status: ${s.status || "N/A"}`);
        console.info(`     Start: ${s.startTime || "N/A"}`);
        console.info(`     End: ${s.endTime || "N/A"}`);
        console.info(`     Created: ${s.createdAt}`);
      });
    }

    console.info("\n🎥 Video metadata samples (up to 5):");
    if (!project.videoMetadata.length) {
      console.info("  None");
    } else {
      project.videoMetadata.forEach((v, idx) => {
        console.info(`  ${idx + 1}. ID: ${v.id}`);
        console.info(`     videoTime: ${v.videoTime}s`);
        console.info(`     lat/lng: ${v.lat}, ${v.lng}`);
        console.info(`     Created: ${v.createdAt}`);
      });
    }
  } catch (e) {
    console.error("❌ Error while searching:", e);
  } finally {
    await client.$disconnect();
  }
}

export { findProjectWithSurveyAndVideo };

