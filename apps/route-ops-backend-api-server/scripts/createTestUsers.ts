import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

dotenv.config();

async function createTestUsers() {
  console.info("👥 Creating additional test users...");

  const { BCRYPT_SALT } = process.env;
  if (!BCRYPT_SALT) {
    throw new Error("BCRYPT_SALT environment variable must be defined");
  }
  const salt = parseSalt(BCRYPT_SALT);

  const client = new PrismaClient();

  try {
    // Get the Lisbon city hall
    const lisbonCityHall = await client.cityHall.findFirst({
      where: { name: "Lisbon" },
    });

    if (!lisbonCityHall) {
      console.info("❌ Lisbon city hall not found");
      return;
    }

    console.info(`✅ Found Lisbon city hall: ${lisbonCityHall.name} (${lisbonCityHall.id})`);

    // Create dashboard user for Lisbon
    let dashboardUser;
    try {
      dashboardUser = await client.user.create({
        data: {
          username: "dashboard.lisbon",
          password: await hash("password123", salt),
          role: "dashboard_user" as const,
          roles: ["dashboard_user"],
          email: "dashboard.lisbon@routeops.com",
          firstName: "Lisbon",
          lastName: "Dashboard User",
          isActive: true,
          cityHall: {
            connect: { id: lisbonCityHall.id }
          },
        },
      });
      console.info("✅ Created dashboard user: dashboard.lisbon");
    } catch (error) {
      console.info("ℹ️ Dashboard user already exists, fetching existing user...");
      dashboardUser = await client.user.findUnique({
        where: { username: "dashboard.lisbon" },
      });
    }

    // Get the Olhão city hall
    const olhaoCityHall = await client.cityHall.findFirst({
      where: { name: "Olhão" },
    });

    if (olhaoCityHall) {
      console.info(`✅ Found Olhão city hall: ${olhaoCityHall.name} (${olhaoCityHall.id})`);

      // Create dashboard user for Olhão
      try {
        const olhaoDashboardUser = await client.user.create({
          data: {
            username: "dashboard.olhao",
            password: await hash("password123", salt),
            role: "dashboard_user" as const,
            roles: ["dashboard_user"],
            email: "dashboard.olhao@routeops.com",
            firstName: "Olhão",
            lastName: "Dashboard User",
            isActive: true,
            cityHall: {
              connect: { id: olhaoCityHall.id }
            },
          },
        });
        console.info("✅ Created dashboard user: dashboard.olhao");
      } catch (error) {
        console.info("ℹ️ Olhão dashboard user already exists");
      }

      // Create app user for Olhão
      try {
        const olhaoAppUser = await client.user.create({
          data: {
            username: "app.olhao",
            password: await hash("password123", salt),
            role: "app_user" as const,
            roles: ["app_user"],
            email: "app.olhao@routeops.com",
            firstName: "Olhão",
            lastName: "App User",
            isActive: true,
            cityHall: {
              connect: { id: olhaoCityHall.id }
            },
          },
        });
        console.info("✅ Created app user: app.olhao");
      } catch (error) {
        console.info("ℹ️ Olhão app user already exists");
      }
    }

    // Create additional app user for Lisbon
    try {
      const lisbonAppUser2 = await client.user.create({
        data: {
          username: "app.lisbon.2",
          password: await hash("password123", salt),
          role: "app_user" as const,
          roles: ["app_user"],
          email: "app.lisbon.2@routeops.com",
          firstName: "Lisbon",
          lastName: "App User 2",
          isActive: true,
          cityHall: {
            connect: { id: lisbonCityHall.id }
          },
        },
      });
      console.info("✅ Created additional app user: app.lisbon.2");
    } catch (error) {
      console.info("ℹ️ Additional Lisbon app user already exists");
    }

    console.info("\n🎉 Test users creation completed!");
    console.info("\n📋 Available test credentials:");
    console.info("   🔑 Admin: admin / admin");
    console.info("   🏢 Dashboard User (Lisbon): dashboard.lisbon / password123");
    console.info("   🏢 Dashboard User (Olhão): dashboard.olhao / password123");
    console.info("   📱 App User (Lisbon): app.lisbon / password123");
    console.info("   📱 App User (Lisbon 2): app.lisbon.2 / password123");
    console.info("   📱 App User (Olhão): app.olhao / password123");

  } catch (error) {
    console.error("❌ Error creating test users:", error);
  } finally {
    await client.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  createTestUsers().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { createTestUsers };
