import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

async function checkUserRoles() {
  console.info("🔍 Checking user roles structure...");

  const client = new PrismaClient();

  try {
    // Get a few sample users to see their roles structure
    const users = await client.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        roles: true,
        cityHall: {
          select: {
            name: true,
          },
        },
      },
      take: 5,
    });

    console.info(`\n📊 Found ${users.length} users with roles:`);
    users.forEach((user, index) => {
      console.info(`\n${index + 1}. ${user.username} (${user.role})`);
      console.info(`   City Hall: ${user.cityHall?.name || 'None'}`);
      console.info(`   Role: ${user.role}`);
      console.info(`   Roles Array: ${JSON.stringify(user.roles)}`);
      console.info(`   Roles Type: ${typeof user.roles}`);
    });

    // Check if we can add mobile app specific roles
    console.info("\n💡 Current role structure analysis:");
    console.info("   - role: Single enum value (admin, dashboard_user, app_user)");
    console.info("   - roles: JSON array that can contain multiple role strings");
    
    console.info("\n🎯 For mobile app access control, you can:");
    console.info("   1. Check if user.role === 'app_user' (basic mobile access)");
    console.info("   2. Check if user.roles includes 'mobile_app' (if you add it)");
    console.info("   3. Check if user.roles includes 'app_user' (current structure)");

  } catch (error) {
    console.error("❌ Error checking user roles:", error);
  } finally {
    await client.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  checkUserRoles().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { checkUserRoles };

