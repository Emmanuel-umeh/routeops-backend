import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

dotenv.config();

async function fixUsers() {
  console.info("🔧 Fixing user roles and assignments...");

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

    // Fix dashboard_lisbon user
    const dashboardLisbon = await client.user.findUnique({
      where: { username: "dashboard_lisbon" },
    });

    if (dashboardLisbon && lisbonCityHall) {
      await client.user.update({
        where: { id: dashboardLisbon.id },
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
      console.info("✅ Fixed dashboard.lisbon user");
    }

    // Fix dashboard_olhao user
    const dashboardOlhao = await client.user.findUnique({
      where: { username: "dashboard_olhao" },
    });

    if (dashboardOlhao && olhaoCityHall) {
      await client.user.update({
        where: { id: dashboardOlhao.id },
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
      console.info("✅ Fixed dashboard.olhao user");
    }

    // Fix app_lisbon_1 user
    const appLisbon1 = await client.user.findUnique({
      where: { username: "app_lisbon_1" },
    });

    if (appLisbon1 && lisbonCityHall) {
      await client.user.update({
        where: { id: appLisbon1.id },
        data: {
          username: "app.lisbon.1",
          password: await hash("password123", salt),
          role: "app_user" as const,
          roles: ["app_user"],
          email: "app.lisbon.1@routeops.com",
          firstName: "Lisbon",
          lastName: "App User 1",
          isActive: true,
          cityHall: {
            connect: { id: lisbonCityHall.id }
          },
        },
      });
      console.info("✅ Fixed app.lisbon.1 user");
    }

    // Fix app_lisbon_2 user
    const appLisbon2 = await client.user.findUnique({
      where: { username: "app_lisbon_2" },
    });

    if (appLisbon2 && lisbonCityHall) {
      await client.user.update({
        where: { id: appLisbon2.id },
        data: {
          username: "app.lisbon.3",
          password: await hash("password123", salt),
          role: "app_user" as const,
          roles: ["app_user"],
          email: "app.lisbon.3@routeops.com",
          firstName: "Lisbon",
          lastName: "App User 3",
          isActive: true,
          cityHall: {
            connect: { id: lisbonCityHall.id }
          },
        },
      });
      console.info("✅ Fixed app.lisbon.3 user");
    }

    // Fix app_olhao_1 user
    const appOlhao1 = await client.user.findUnique({
      where: { username: "app_olhao_1" },
    });

    if (appOlhao1 && olhaoCityHall) {
      await client.user.update({
        where: { id: appOlhao1.id },
        data: {
          username: "app.olhao.1",
          password: await hash("password123", salt),
          role: "app_user" as const,
          roles: ["app_user"],
          email: "app.olhao.1@routeops.com",
          firstName: "Olhão",
          lastName: "App User 1",
          isActive: true,
          cityHall: {
            connect: { id: olhaoCityHall.id }
          },
        },
      });
      console.info("✅ Fixed app.olhao.1 user");
    }

    console.info("\n🎉 User fixes completed!");
    console.info("\n📋 Updated test credentials:");
    console.info("   🔑 Admin: admin / admin");
    console.info("   🏢 Dashboard User (Lisbon): dashboard.lisbon / password123");
    console.info("   🏢 Dashboard User (Olhão): dashboard.olhao / password123");
    console.info("   📱 App User (Lisbon): app.lisbon / password123");
    console.info("   📱 App User (Lisbon 2): app.lisbon.2 / password123");
    console.info("   📱 App User (Lisbon 3): app.lisbon.3 / password123");
    console.info("   📱 App User (Olhão): app.olhao / password123");
    console.info("   📱 App User (Olhão 1): app.olhao.1 / password123");

  } catch (error) {
    console.error("❌ Error fixing users:", error);
  } finally {
    await client.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  fixUsers().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { fixUsers };
