import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const project = await prisma.project.create({
      data: {
        name: "Demo Survey Project",
        status: "completed",
        createdBy: "seed",
      },
      select: { id: true },
    });

    const coords: [number, number][] = [
      [-9.1605, 38.7369],
      [-9.1582, 38.7376],
      [-9.1563, 38.7384],
      [-9.1547, 38.7390],
    ];
    const geometry = { type: "LineString", coordinates: coords } as any;
    const bbox: [number, number, number, number] = [
      Math.min(...coords.map((c) => c[0])),
      Math.min(...coords.map((c) => c[1])),
      Math.max(...coords.map((c) => c[0])),
      Math.max(...coords.map((c) => c[1])),
    ];

    const survey = await prisma.survey.create({
      data: {
        project: { connect: { id: project.id } },
        name: "Demo Survey",
        startTime: new Date(),
        endTime: new Date(),
        status: "Completed",
        geometryJson: geometry,
        bbox: bbox as any,
        eIriAvg: 2.4,
        lengthMeters: 1234,
      },
      select: { id: true },
    });

    await prisma.hazard.createMany({
      data: [
        { projectId: project.id, latitude: 38.7376, longitude: -9.1582, severity: "high", description: "Pothole" },
        { projectId: project.id, latitude: 38.7390, longitude: -9.1547, severity: "medium", description: "Crack" },
      ],
    });

    console.log("Seeded demo project:", project.id, "survey:", survey.id);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


