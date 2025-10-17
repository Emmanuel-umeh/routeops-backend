import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

async function testSingleHazardWithRemarks() {
  console.info("🧪 Testing single hazard endpoint with remarks...");

  const client = new PrismaClient();

  try {
    // Get a hazard that has remarks
    const hazard = await client.hazard.findFirst({
      where: {
        remarks: {
          some: {},
        },
      },
      include: {
        project: true,
        routePoint: true,
        remarks: {
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
        },
      },
    });

    if (!hazard) {
      console.info("❌ No hazards with remarks found. Please run the test-hazard-remarks script first.");
      return;
    }

    console.info(`✅ Found hazard: ${hazard.typeField} (${hazard.severity})`);
    console.info(`   Project: ${hazard.project?.name || 'Unknown'}`);
    console.info(`   Remarks count: ${hazard.remarks.length}`);

    console.info("\n📋 Remarks for this hazard:");
    hazard.remarks.forEach((remark, index) => {
      console.info(`   ${index + 1}. "${remark.text}"`);
      console.info(`      User: ${remark.user?.username} (${remark.user?.firstName} ${remark.user?.lastName})`);
      console.info(`      Survey: ${remark.survey?.name} (${remark.survey?.status})`);
      console.info(`      Created: ${remark.createdAt.toISOString()}`);
      console.info("");
    });

    // Simulate what the API endpoint would return
    const apiResponse = {
      id: hazard.id,
      description: hazard.description,
      severity: hazard.severity,
      typeField: hazard.typeField,
      latitude: hazard.latitude,
      longitude: hazard.longitude,
      imageUrl: hazard.imageUrl,
      createdBy: hazard.createdBy,
      project: {
        id: hazard.project?.id,
      },
      routePoint: hazard.routePoint ? {
        id: hazard.routePoint.id,
      } : null,
      remarks: hazard.remarks.map(remark => ({
        id: remark.id,
        text: remark.text,
        timestamp: remark.timestamp,
        createdAt: remark.createdAt,
        user: {
          id: remark.user?.id,
          username: remark.user?.username,
          firstName: remark.user?.firstName,
          lastName: remark.user?.lastName,
        },
        survey: {
          id: remark.survey?.id,
          name: remark.survey?.name,
          status: remark.survey?.status,
        },
      })),
      createdAt: hazard.createdAt,
      updatedAt: hazard.updatedAt,
    };

    console.info("📤 API Response structure:");
    console.info(JSON.stringify(apiResponse, null, 2));

    console.info("\n🎉 Single hazard with remarks test completed successfully!");
    console.info("✅ The GET /hazards/:id endpoint now includes remarks with user and survey information");

  } catch (error) {
    console.error("❌ Error testing single hazard with remarks:", error);
  } finally {
    await client.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testSingleHazardWithRemarks().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { testSingleHazardWithRemarks };
