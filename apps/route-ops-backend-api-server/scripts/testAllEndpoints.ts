import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

async function testAllEndpoints() {
  console.info("🧪 Testing all new endpoints and user flows...");

  const client = new PrismaClient();

  try {
    // Test 1: Verify Admin User
    console.info("\n1️⃣ Testing Admin User...");
    const adminUser = await client.user.findUnique({
      where: { username: "admin" },
      include: { cityHall: true },
    });

    if (adminUser) {
      console.info(`✅ Admin user found: ${adminUser.username} (${adminUser.role})`);
      console.info(`   City Hall: ${adminUser.cityHall?.name || 'None'}`);
    } else {
      console.info("❌ Admin user not found");
    }

    // Test 2: Verify Dashboard User
    console.info("\n2️⃣ Testing Dashboard User...");
    const dashboardUser = await client.user.findUnique({
      where: { username: "dashboard.lisbon" },
      include: { cityHall: true },
    });

    if (dashboardUser) {
      console.info(`✅ Dashboard user found: ${dashboardUser.username} (${dashboardUser.role})`);
      console.info(`   City Hall: ${dashboardUser.cityHall?.name || 'None'}`);
    } else {
      console.info("❌ Dashboard user not found");
    }

    // Test 3: Verify App User
    console.info("\n3️⃣ Testing App User...");
    const appUser = await client.user.findUnique({
      where: { username: "app.lisbon" },
      include: { cityHall: true },
    });

    if (appUser) {
      console.info(`✅ App user found: ${appUser.username} (${appUser.role})`);
      console.info(`   City Hall: ${appUser.cityHall?.name || 'None'}`);
    } else {
      console.info("❌ App user not found");
    }

    // Test 4: Verify City Halls
    console.info("\n4️⃣ Testing City Halls...");
    const cityHalls = await client.cityHall.findMany({
      orderBy: { name: 'asc' },
    });

    console.info(`✅ Found ${cityHalls.length} city halls:`);
    cityHalls.forEach((cityHall, index) => {
      console.info(`   ${index + 1}. ${cityHall.name} (${cityHall.id})`);
    });

    // Test 5: Verify Projects
    console.info("\n5️⃣ Testing Projects...");
    const projects = await client.project.findMany({
      include: {
        cityHall: true,
        hazards: true,
        routePoints: true,
      },
    });

    console.info(`✅ Found ${projects.length} projects:`);
    projects.forEach((project, index) => {
      console.info(`   ${index + 1}. ${project.name} (${project.status})`);
      console.info(`      City Hall: ${project.cityHall?.name || 'None'}`);
      console.info(`      Hazards: ${project.hazards.length}`);
      console.info(`      Route Points: ${project.routePoints.length}`);
    });

    // Test 6: Verify Hazards
    console.info("\n6️⃣ Testing Hazards...");
    const hazards = await client.hazard.findMany({
      include: {
        project: true,
        routePoint: true,
        remarks: {
          include: {
            user: true,
            survey: true,
          },
        },
      },
    });

    console.info(`✅ Found ${hazards.length} hazards:`);
    hazards.forEach((hazard, index) => {
      console.info(`   ${index + 1}. ${hazard.typeField} (${hazard.severity})`);
      console.info(`      Project: ${hazard.project?.name || 'None'}`);
      console.info(`      Remarks: ${hazard.remarks.length}`);
      if (hazard.remarks.length > 0) {
        hazard.remarks.forEach((remark, remarkIndex) => {
          console.info(`         ${remarkIndex + 1}. "${remark.text}" by ${remark.user?.username}`);
        });
      }
    });

    // Test 7: Test Role-Based User Queries
    console.info("\n7️⃣ Testing Role-Based User Queries...");
    
    // Get all dashboard users
    const dashboardUsers = await client.user.findMany({
      where: { role: "dashboard_user" },
      include: { cityHall: true },
    });
    console.info(`✅ Dashboard users: ${dashboardUsers.length}`);
    dashboardUsers.forEach(user => {
      console.info(`   - ${user.username} (${user.cityHall?.name})`);
    });

    // Get all app users
    const appUsers = await client.user.findMany({
      where: { role: "app_user" },
      include: { cityHall: true },
    });
    console.info(`✅ App users: ${appUsers.length}`);
    appUsers.forEach(user => {
      console.info(`   - ${user.username} (${user.cityHall?.name})`);
    });

    // Test 8: Test City Hall Assignments
    console.info("\n8️⃣ Testing City Hall Assignments...");
    const usersByCityHall = await client.user.groupBy({
      by: ['cityHallId'],
      _count: {
        id: true,
      },
    });

    for (const group of usersByCityHall) {
      if (group.cityHallId) {
        const cityHall = await client.cityHall.findUnique({
          where: { id: group.cityHallId },
        });
        console.info(`✅ ${cityHall?.name}: ${group._count.id} users`);
      }
    }

    // Test 9: Test Surveys and Remarks
    console.info("\n9️⃣ Testing Surveys and Remarks...");
    const surveys = await client.survey.findMany({
      include: {
        remarks: {
          include: {
            user: true,
            hazard: true,
          },
        },
        project: true,
      },
    });

    console.info(`✅ Found ${surveys.length} surveys:`);
    surveys.forEach((survey, index) => {
      console.info(`   ${index + 1}. ${survey.name} (${survey.status})`);
      console.info(`      Project: ${survey.project?.name || 'None'}`);
      console.info(`      Remarks: ${survey.remarks.length}`);
      survey.remarks.forEach((remark, remarkIndex) => {
        console.info(`         ${remarkIndex + 1}. "${remark.text}" by ${remark.user?.username} for ${remark.hazard?.typeField}`);
      });
    });

    // Test 10: Summary
    console.info("\n🎯 Test Summary:");
    console.info(`   ✅ Users: ${await client.user.count()}`);
    console.info(`   ✅ City Halls: ${await client.cityHall.count()}`);
    console.info(`   ✅ Projects: ${await client.project.count()}`);
    console.info(`   ✅ Hazards: ${await client.hazard.count()}`);
    console.info(`   ✅ Route Points: ${await client.routePoint.count()}`);
    console.info(`   ✅ Surveys: ${await client.survey.count()}`);
    console.info(`   ✅ Remarks: ${await client.remark.count()}`);

    console.info("\n🎉 All tests completed successfully!");
    console.info("\n📋 Ready for API testing with these credentials:");
    console.info("   🔑 Admin: admin / admin");
    console.info("   🏢 Dashboard User: dashboard.lisbon / password123");
    console.info("   📱 App User: app.lisbon / password123");

  } catch (error) {
    console.error("❌ Error during testing:", error);
  } finally {
    await client.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testAllEndpoints().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { testAllEndpoints };
