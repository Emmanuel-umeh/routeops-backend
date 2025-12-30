import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testSegmentation() {
  console.log("Testing Edge Segmentation...\n");

  // Check recent ratings with segments
  const recentRatings = await prisma.roadRatingHistory.findMany({
    where: {
      segmentId: { not: null },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
    },
    select: {
      roadId: true,
      segmentId: true,
      eiri: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  console.log(`Found ${recentRatings.length} segmented ratings in last 24 hours:`);
  recentRatings.forEach((r) => {
    console.log(`  - RoadId: ${r.roadId}, SegmentId: ${r.segmentId}, EIRI: ${r.eiri}`);
  });

  // Check segments per edge
  const segmentsByEdge = await prisma.roadRatingHistory.groupBy({
    by: ["roadId"],
    where: {
      segmentId: { not: null },
    },
    _count: {
      segmentId: true,
    },
    orderBy: {
      _count: {
        segmentId: "desc",
      },
    },
    take: 10,
  });

  console.log("\nEdges with most segments:");
  segmentsByEdge.forEach((s) => {
    console.log(`  - ${s.roadId}: ${s._count.segmentId} segments`);
  });

  // Verify backward compatibility (ratings without segmentId)
  const oldRatings = await prisma.roadRatingHistory.count({
    where: {
      segmentId: null,
    },
  });

  console.log(`\nBackward compatibility: ${oldRatings} ratings without segmentId (still valid)`);

  // Check RoadRating table
  const roadRatingsWithSegments = await prisma.roadRating.findMany({
    where: {
      segmentId: { not: null },
    },
    select: {
      roadId: true,
      segmentId: true,
      eiri: true,
    },
    take: 10,
  });

  console.log(`\nRoadRating entries with segments: ${roadRatingsWithSegments.length}`);
  roadRatingsWithSegments.forEach((r) => {
    console.log(`  - RoadId: ${r.roadId}, SegmentId: ${r.segmentId}, EIRI: ${r.eiri}`);
  });

  await prisma.$disconnect();
}

testSegmentation().catch(console.error);

