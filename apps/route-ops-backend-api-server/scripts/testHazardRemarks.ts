import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

async function testHazardRemarks() {
  console.info("🧪 Testing hazard remarks functionality...");

  const client = new PrismaClient();

  try {
    // Get a hazard to test with
    const hazard = await client.hazard.findFirst({
      include: {
        project: true,
        remarks: {
          include: {
            user: true,
            survey: true,
          },
        },
      },
    });

    if (!hazard) {
      console.info("❌ No hazards found in database. Please run the seeding scripts first.");
      return;
    }

    console.info(`✅ Found hazard: ${hazard.typeField} (${hazard.severity})`);
    console.info(`   Project: ${hazard.project?.name || 'Unknown'}`);
    console.info(`   Current remarks: ${hazard.remarks.length}`);

    // Get a user to test with
    const user = await client.user.findFirst({
      where: { role: { not: null } },
    });

    if (!user) {
      console.info("❌ No users found in database. Please run the seeding scripts first.");
      return;
    }

    console.info(`✅ Found user: ${user.username} (${user.role})`);

    // Test the workflow by creating a remark
    console.info("\n🔧 Testing remark creation workflow...");

    // Check if user has an active survey for this project
    let survey = await client.survey.findFirst({
      where: {
        assignedUser: user.id,
        projectId: hazard.projectId,
        status: "active",
      },
    });

    if (!survey) {
      console.info("📝 Creating new survey for user...");
      survey = await client.survey.create({
        data: {
          name: `Hazard Survey - ${hazard.typeField || 'Unknown Hazard'}`,
          status: "active",
          assignedUser: user.id,
          startTime: new Date(),
          project: { connect: { id: hazard.projectId! } },
        },
      });
      console.info(`✅ Created survey: ${survey.name}`);
    } else {
      console.info(`✅ Found existing survey: ${survey.name}`);
    }

    // Create a test remark
    const testRemark = await client.remark.create({
      data: {
        text: "Test remark: This hazard needs attention",
        timestamp: new Date(),
        user: { connect: { id: user.id } },
        hazard: { connect: { id: hazard.id } },
        survey: { connect: { id: survey.id } },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        hazard: {
          select: {
            id: true,
            typeField: true,
            severity: true,
          },
        },
        survey: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    console.info("✅ Created test remark:");
    console.info(`   Text: ${testRemark.text}`);
    console.info(`   User: ${testRemark.user?.username}`);
    console.info(`   Hazard: ${testRemark.hazard?.typeField} (${testRemark.hazard?.severity})`);
    console.info(`   Survey: ${testRemark.survey?.name}`);

    // Verify the relationships
    const updatedHazard = await client.hazard.findUnique({
      where: { id: hazard.id },
      include: {
        remarks: {
          include: {
            user: true,
            survey: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    console.info(`\n📊 Updated hazard now has ${updatedHazard?.remarks.length} remarks`);

    // Test getting remarks for the hazard
    const hazardRemarks = await client.remark.findMany({
      where: { hazardId: hazard.id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        survey: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    console.info(`\n📋 All remarks for hazard ${hazard.typeField}:`);
    hazardRemarks.forEach((remark, index) => {
      console.info(`   ${index + 1}. "${remark.text}" by ${remark.user?.username} (Survey: ${remark.survey?.name})`);
    });

    console.info("\n🎉 Hazard remarks functionality test completed successfully!");

  } catch (error) {
    console.error("❌ Error testing hazard remarks:", error);
  } finally {
    await client.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testHazardRemarks().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { testHazardRemarks };
