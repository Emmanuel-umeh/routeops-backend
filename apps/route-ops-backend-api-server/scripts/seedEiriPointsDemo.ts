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
  const coords = [start] as Coord[];
  deltas.forEach((d) => coords.push([coords[coords.length - 1][0] + d[0], coords[coords.length - 1][1] + d[1]]));
  return coords.map((coord, i) => ({
    coord,
    eIri: eiri[Math.min(i, eiri.length - 1)],
  }));
}

async function main() {
  console.log("🧹 Clearing existing data (remarks, hazards, surveys, routePoints, projects, users, cityHalls)...");
  await prisma.remark.deleteMany({});
  await prisma.hazard.deleteMany({});
  await prisma.survey.deleteMany({});
  await prisma.routePoint.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.cityHall.deleteMany({});
  console.log("✅ All core tables cleared.");

  console.log("🏗️ Seeding base entities and users...");
  const entityLisbon = await prisma.cityHall.create({
    data: { name: "Lisbon", description: "Lisbon Municipality", allowImages: true, allowVideo: true },
  });
  const entityPorto = await prisma.cityHall.create({
    data: { name: "Porto", description: "Porto Municipality", allowImages: true, allowVideo: true },
  });

  const { BCRYPT_SALT } = process.env;
  if (!BCRYPT_SALT) throw new Error("BCRYPT_SALT must be set (used to hash demo user passwords)");
  const salt = parseSalt(BCRYPT_SALT);
  const hashed = await hash("password123", salt);

  await prisma.user.create({
    data: {
      username: "admin",
      password: hashed,
      roles: ["admin"],
      role: "admin",
      isActive: true,
      email: "admin@example.com",
    },
  });

  await prisma.user.create({
    data: {
      username: "dashboard_user",
      password: hashed,
      roles: ["dashboard_user"],
      role: "dashboard_user",
      isActive: true,
      email: "dashboard@example.com",
      cityHallId: entityLisbon.id,
    },
  });

  const appUser = await prisma.user.create({
    data: {
      username: "app_user",
      password: hashed,
      roles: ["app_user"],
      role: "app_user",
      isActive: true,
      email: "app@example.com",
      cityHallId: entityLisbon.id,
    },
  });

  const appUserPorto = await prisma.user.create({
    data: {
      username: "app_porto",
      password: hashed,
      roles: ["app_user"],
      role: "app_user",
      isActive: true,
      email: "app.porto@example.com",
      cityHallId: entityPorto.id,
    },
  });

  console.log("✅ Users & CityHalls seeded.");
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
    name: "Figma Demo Route A (Lisbon)",
    userId: appUser.id,
    entityId: entityLisbon.id,
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
    name: "Figma Demo Route B (Lisbon)",
    userId: appUser.id,
    entityId: entityLisbon.id,
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
    name: "Figma Demo Route C (Lisbon)",
    userId: appUser.id,
    entityId: entityLisbon.id,
    points: cPoints,
  });

  // Project D: Porto example to validate city-hall scoping
  const dPoints = makeEiriPath(
    [-8.6291, 41.1579],
    [
      [0.0006, 0.0004],
      [0.0006, 0.0004],
      [0.0006, 0.0004],
      [0.0006, 0.0004],
    ],
    [1.7, 1.9, 2.4, 2.2, 1.8]
  );
  await seedProjectWithSurvey({
    name: "Figma Demo Route D (Porto)",
    userId: appUserPorto.id,
    entityId: entityPorto.id,
    points: dPoints,
  });

  console.log("🎉 Seeded EIRI demo data (FeatureCollections with point-level eIRI).");
  console.log("🔑 Logins:");
  console.log("   - admin / password123");
  console.log("   - dashboard_user / password123 (city: Lisbon)");
  console.log("   - app_user / password123 (city: Lisbon)");
  console.log("   - app_porto / password123 (city: Porto)");
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


