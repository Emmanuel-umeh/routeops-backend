import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

dotenv.config();

async function createWorkingUsers() {
  console.info("👥 Creating working test users...");

  const { BCRYPT_SALT } = process.env;
  if (!BCRYPT_SALT) {
    throw new Error("BCRYPT_SALT environment variable must be defined");
  }
  const salt = parseSalt(BCRYPT_SALT);

  const client = new PrismaClient();

  try {
    // Get city halls
    const lisbonCityHall = await client.cityHall.findFirst({
      where: { name: "Lisbon" },
    });

    const olhaoCityHall = await client.cityHall.findFirst({
      where: { name: "Olhão" },
    });

    console.info(`✅ Found Lisbon city hall: ${lisbonCityHall?.name}`);
    console.info(`✅ Found Olhão city hall: ${olhaoCityHall?.name}`);

    // Create dashboard user for Lisbon with unique username
    if (lisbonCityHall) {
      try {
        const dashboardLisbon = await client.user.create({
          data: {
            username: "dash.lisbon",
            password: await hash("password123", salt),
            role: "dashboard_user" as const,
            roles: ["dashboard_user"],
            email: "dash.lisbon@routeops.com",
            firstName: "Lisbon",
            lastName: "Dashboard User",
            isActive: true,
            cityHall: {
              connect: { id: lisbonCityHall.id }
            },
          },
        });
        console.info("✅ Created dash.lisbon user");
      } catch (error) {
        console.info("ℹ️ dash.lisbon user already exists");
      }
    }

    // Create dashboard user for Olhão with unique username
    if (olhaoCityHall) {
      try {
        const dashboardOlhao = await client.user.create({
          data: {
            username: "dash.olhao",
            password: await hash("password123", salt),
            role: "dashboard_user" as const,
            roles: ["dashboard_user"],
            email: "dash.olhao@routeops.com",
            firstName: "Olhão",
            lastName: "Dashboard User",
            isActive: true,
            cityHall: {
              connect: { id: olhaoCityHall.id }
            },
          },
        });
        console.info("✅ Created dash.olhao user");
      } catch (error) {
        console.info("ℹ️ dash.olhao user already exists");
      }
    }

    console.info("\n🎉 Working users creation completed!");
    console.info("\n📋 Working test credentials:");
    console.info("   🔑 Admin: admin / admin");
    console.info("   🏢 Dashboard User (Lisbon): dash.lisbon / password123");
    console.info("   🏢 Dashboard User (Olhão): dash.olhao / password123");
    console.info("   📱 App User (Lisbon): app.lisbon / password123");
    console.info("   📱 App User (Lisbon 2): app.lisbon.2 / password123");
    console.info("   📱 App User (Lisbon 3): app.lisbon.3 / password123");
    console.info("   📱 App User (Olhão): app.olhao / password123");
    console.info("   📱 App User (Olhão 1): app.olhao.1 / password123");

  } catch (error) {
    console.error("❌ Error creating working users:", error);
  } finally {
    await client.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  createWorkingUsers().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { createWorkingUsers };
