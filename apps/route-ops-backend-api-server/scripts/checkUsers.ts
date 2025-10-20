import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

async function checkUsers() {
  console.info("🔍 Checking all users in database...");

  const client = new PrismaClient();

  try {
    const allUsers = await client.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        cityHall: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { username: 'asc' },
    });

    console.info(`\n📊 Found ${allUsers.length} users:`);
    allUsers.forEach((user, index) => {
      console.info(`   ${index + 1}. ${user.username} (${user.role}) - ${user.cityHall?.name || 'No City Hall'}`);
    });

    // Check specifically for dashboard users
    const dashboardUsers = await client.user.findMany({
      where: { role: "dashboard_user" },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        cityHall: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.info(`\n🏢 Dashboard users: ${dashboardUsers.length}`);
    dashboardUsers.forEach((user, index) => {
      console.info(`   ${index + 1}. ${user.username} - ${user.cityHall?.name || 'No City Hall'}`);
    });

    // Check specifically for app users
    const appUsers = await client.user.findMany({
      where: { role: "app_user" },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        cityHall: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.info(`\n📱 App users: ${appUsers.length}`);
    appUsers.forEach((user, index) => {
      console.info(`   ${index + 1}. ${user.username} - ${user.cityHall?.name || 'No City Hall'}`);
    });

    // Check specifically for admin users
    const adminUsers = await client.user.findMany({
      where: { role: "admin" },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        cityHall: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.info(`\n🔑 Admin users: ${adminUsers.length}`);
    adminUsers.forEach((user, index) => {
      console.info(`   ${index + 1}. ${user.username} - ${user.cityHall?.name || 'No City Hall'}`);
    });

  } catch (error) {
    console.error("❌ Error checking users:", error);
  } finally {
    await client.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  checkUsers().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { checkUsers };
