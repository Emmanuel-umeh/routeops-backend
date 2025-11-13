import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

type GeoJSON =
  | {
      type: "FeatureCollection";
      features?: Array<{
        type?: string;
        geometry?: { type?: string; coordinates?: any };
        properties?: Record<string, any>;
      }>;
    }
  | { type: "LineString"; coordinates?: any }
  | { type?: string; [k: string]: any }
  | null;

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("🔎 Auditing surveys for per-point eIRI data...\n");

  const surveys = await prisma.survey.findMany({
    select: {
      id: true,
      projectId: true,
      createdAt: true,
      updatedAt: true,
      eIriAvg: true,
      geometryJson: true,
      lengthMeters: true,
    },
    orderBy: { createdAt: "desc" },
  });

  let total = 0;
  let withFeatureCollection = 0;
  let withPointEiri = 0;
  let candidatesForSegments = 0;
  const projects: Record<
    string,
    {
      surveys: number;
      withPointEiri: number;
      candidates: number;
      sample?: {
        surveyId: string;
        pointsWithEiri: number;
        totalPoints: number;
      };
    }
  > = {};

  for (const s of surveys) {
    total++;
    const geom = (s.geometryJson as unknown) as GeoJSON;
    const projectId = s.projectId ?? "unknown";
    projects[projectId] ||= { surveys: 0, withPointEiri: 0, candidates: 0 };
    projects[projectId].surveys++;

    if (!geom || !("type" in geom)) {
      continue;
    }
    if (geom.type === "FeatureCollection") {
      withFeatureCollection++;
      const features = Array.isArray(geom.features) ? geom.features : [];
      const pointFeatures = features.filter(
        (f) => f?.geometry?.type === "Point" && Array.isArray(f.geometry?.coordinates)
      );
      const pointsWithEiri = pointFeatures.filter((f) =>
        Number.isFinite(Number(f?.properties?.eIri))
      );
      if (pointFeatures.length > 0 && pointsWithEiri.length > 0) {
        withPointEiri++;
        projects[projectId].withPointEiri++;
        if (pointFeatures.length >= 2) {
          candidatesForSegments++;
          projects[projectId].candidates++;
        }
        if (!projects[projectId].sample) {
          projects[projectId].sample = {
            surveyId: s.id,
            pointsWithEiri: pointsWithEiri.length,
            totalPoints: pointFeatures.length,
          };
        }
      }
    }
  }

  console.log(`Total surveys: ${total}`);
  console.log(`FeatureCollections: ${withFeatureCollection}`);
  console.log(`Surveys with point-level eIRI: ${withPointEiri}`);
  console.log(`Surveys ready for colored segments (>=2 points): ${candidatesForSegments}\n`);

  console.log("By project (only those with any point-level eIRI):");
  Object.entries(projects)
    .filter(([, v]) => v.withPointEiri > 0)
    .sort((a, b) => b[1].withPointEiri - a[1].withPointEiri)
    .forEach(([projectId, v]) => {
      const sampleText = v.sample
        ? ` sampleSurvey=${v.sample.surveyId} pointsWithEiri=${v.sample.pointsWithEiri}/${v.sample.totalPoints}`
        : "";
      console.log(
        `  • ${projectId}: surveys=${v.surveys} withPointEiri=${v.withPointEiri} candidates=${v.candidates}${sampleText}`
      );
    });

  console.log(
    "\n✅ If candidatesForSegments > 0, the frontend can already draw per-segment colors for those surveys by iterating adjacent point pairs."
  );
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error("Audit failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

