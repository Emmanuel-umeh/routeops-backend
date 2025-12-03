import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  // Project that already has edgeId in its geometry
  const projectId = "026bbaf0-6fa2-48d9-a374-bedbb64b0ca7";

  console.log("🔄 Backfilling edgeIds for surveys of project:", projectId);

  const surveys = await prisma.survey.findMany({
    where: { projectId },
    select: { id: true, geometryJson: true },
  });

  if (surveys.length === 0) {
    console.log("⚠️  No surveys found for this project.");
    return;
  }

  for (const survey of surveys as any[]) {
    const edgeIdSet = new Set<string>();
    const geom = survey.geometryJson;

    if (geom && typeof geom === "object") {
      // Expecting FeatureCollection with features[*].properties.edgeId / edge_id / roadId / road_id
      const features =
        Array.isArray((geom as any).features) ? (geom as any).features : [];

      for (const f of features) {
        const props = (f as any)?.properties ?? {};
        const edgeId =
          props.edgeId ??
          props.edge_id ??
          props.roadId ??
          props.road_id ??
          null;
        if (typeof edgeId === "string" && edgeId.trim().length > 0) {
          edgeIdSet.add(edgeId.trim());
        }
      }
    }

    const edgeIds = Array.from(edgeIdSet);

    console.log(
      `Survey ${survey.id}: found ${edgeIds.length} distinct edgeId(s)`
    );

    await prisma.survey.update({
      where: { id: survey.id },
      data: { edgeIds } as any,
    });
  }

  console.log("✅ Backfill complete.");
}

main()
  .catch((e) => {
    console.error("❌ Error in backfillEdgeIdsForProject:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


