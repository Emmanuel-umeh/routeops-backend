import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import { hash } from "bcrypt";
import { parseSalt } from "../src/auth/password.service";

dotenv.config();

const prisma = new PrismaClient();

type Coord = [number, number]; // [lng, lat]

function featureCollectionFromPoints(points: Array<{ coord: Coord; eIri: number }>) {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      properties: { eIri: p.eIri, direction: "forward" },
      geometry: { type: "Point", coordinates: p.coord },
    })),
  };
}

function bboxFromCoords(coords: Coord[]): [number, number, number, number] {
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

function lengthMeters(coords: Coord[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const dLat = (lat2 - lat1) * 111000;
    const dLng = (lng2 - lng1) * 111000 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    total += Math.sqrt(dLat * dLat + dLng * dLng);
  }
  return total;
}

function makeEiriPath(start: Coord, deltas: Coord[], eiri: number[]): Array<{ coord: Coord; eIri: number }> {
  const coords: Coord[] = [start];
  deltas.forEach((d) => coords.push([coords[coords.length - 1][0] + d[0], coords[coords.length - 1][1] + d[1]]));
  const points = coords.map((coord, i) => ({
    coord,
    eIri: eiri[Math.min(i, eiri.length - 1)],
  }));
  return points;
}

async function main() {
  console.log("🧹 Clearing existing data (remarks, hazards, surveys, routePoints, projects)...");
  await prisma.remark.deleteMany({});
  await prisma.hazard.deleteMany({});
  await prisma.survey.deleteMany({});
  await prisma.routePoint.deleteMany({});
  await prisma.project.deleteMany({});

  console.log("✅ Cleared dependent tables.");

  // Resolve an existing app user and entity - do not create new users
  console.log("👤 Resolving existing users/entities (no creation)...");
  const appUser =
    (await prisma.user.findUnique({ where: { username: "app_user" } })) ||
    (await prisma.user.findFirst({ where: { role: "app_user" as any } })) ||
    (await prisma.user.findFirst());
  if (!appUser) {
    throw new Error("No users found. Please create users first (e.g., run your existing user seed).");
  }
  const entity =
    (appUser.cityHallId
      ? await prisma.cityHall.findUnique({ where: { id: appUser.cityHallId } })
      : null) || (await prisma.cityHall.findFirst());
  if (!entity) {
    console.warn("⚠️ No CityHall found; projects will be seeded without an entity association.");
  }

  console.log("✅ Using user:", appUser.username, "entity:", entity?.name ?? "(none)");
  console.log("➡️  Seeding projects with FeatureCollection (point-level eIRI)...");

  // Project A: Mixed eIRI along a short route in Lisbon
  const aPoints = makeEiriPath(
    [-9.1393, 38.7223],
    [
      [0.0013, 0.0007],
      [0.0012, 0.0008],
      [0.0015, 0.0005],
      [0.0010, 0.0005],
      [0.0010, 0.0005],
    ],
    [1.8, 2.3, 3.1, 2.6, 1.9, 2.7]
  );
  await seedProjectWithSurvey({
    name: "Figma Demo Route A",
    userId: appUser.id,
    entityId: entity?.id ?? null,
    points: aPoints,
  });

  // Project B: Generally good (green) with a red patch
  const bPoints = makeEiriPath(
    [-9.1508, 38.7139],
    [
      [0.0004, -0.0001],
      [0.0005, -0.0002],
      [0.0005, -0.0003],
      [0.0006, -0.0002],
      [0.0006, -0.0002],
    ],
    [1.6, 1.7, 4.2, 1.8, 1.7, 1.6]
  );
  await seedProjectWithSurvey({
    name: "Figma Demo Route B",
    userId: appUser.id,
    entityId: entity?.id ?? null,
    points: bPoints,
  });

  // Project C: Mostly orange
  const cPoints = makeEiriPath(
    [-9.1285, 38.7155],
    [
      [0.0008, 0.0005],
      [0.0008, 0.0005],
      [0.0008, 0.0005],
      [0.0008, 0.0005],
    ],
    [2.3, 2.6, 2.8, 2.4, 2.5]
  );
  await seedProjectWithSurvey({
    name: "Figma Demo Route C",
    userId: appUser.id,
    entityId: entity?.id ?? null,
    points: cPoints,
  });

  console.log("🎉 Seeded EIRI demo data (FeatureCollections with point-level eIRI).");
  console.log("🔑 Login: app_user / password123");
  console.log("🗺️  Test: GET /api/surveys/map?bbox=-9.75,38.27,-8.54,39.20&months=6");
}

async function seedProjectWithSurvey(args: {
  name: string;
  userId: string;
  entityId: string | null;
  points: Array<{ coord: Coord; eIri: number }>;
}) {
  const coords = args.points.map((p) => p.coord);
  const fc = featureCollectionFromPoints(args.points);
  const bbox = bboxFromCoords(coords);
  const avg =
    args.points.length > 0
      ? args.points.reduce((s, p) => s + p.eIri, 0) / args.points.length
      : null;
  const length = lengthMeters(coords);

  const project = await prisma.project.create({
    data: {
      name: args.name,
      description: "Demo with FeatureCollection of Points (eIri per point)",
      status: "completed",
      createdBy: args.userId,
      ...(args.entityId ? { cityHallId: args.entityId } : {}),
    },
  });

  await prisma.survey.create({
    data: {
      projectId: project.id,
      name: `Survey - ${args.name}`,
      status: "Completed",
      startTime: new Date(),
      endTime: new Date(),
      geometryJson: fc as any,
      bbox: bbox as any,
      eIriAvg: avg as any,
      lengthMeters: length as any,
    },
  });
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


