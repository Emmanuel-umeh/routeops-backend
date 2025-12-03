import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding pilot entities...");

  // Entity 1: Infralobo
  const existingInfralobo = await prisma.cityHall.findFirst({
    where: { name: "Infralobo" },
  });

  const infralobo = existingInfralobo
    ? await prisma.cityHall.update({
        where: { id: existingInfralobo.id },
        data: {
          description: "",
          defaultLatitude: 37.060899,
          defaultLongitude: -8.064873,
          gisFileVersion: "1.0",
          gisFileUrl: "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/geopackages%2Ffaro.gpkg?alt=media&token=9e4f5d1f-b061-4300-9c0b-d0c8143dbb7e",
          allowVideo: true,
          allowImages: true,
        } as any,
      })
    : await prisma.cityHall.create({
        data: {
          name: "Infralobo",
          description: "",
          defaultLatitude: 37.060899,
          defaultLongitude: -8.064873,
          gisFileVersion: "1.0",
          gisFileUrl: "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/geopackages%2Ffaro.gpkg?alt=media&token=9e4f5d1f-b061-4300-9c0b-d0c8143dbb7e",
          allowVideo: true,
          allowImages: true,
        } as any,
      });

  console.log("✅ Created/Updated Infralobo:", infralobo.id);

  // Entity 2: SmartRoads
  const existingSmartRoads = await prisma.cityHall.findFirst({
    where: { name: "SmartRoads" },
  });

  const smartroads = existingSmartRoads
    ? await prisma.cityHall.update({
        where: { id: existingSmartRoads.id },
        data: {
          description: "",
          defaultLatitude: 38.703202,
          defaultLongitude: -9.304298,
          gisFileVersion: "1.0",
          gisFileUrl: "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/geopackages%2Foeiras.gpkg?alt=media&token=7a9fe01e-5587-4767-b6ef-066e026fb522",
          allowVideo: true,
          allowImages: true,
        } as any,
      })
    : await prisma.cityHall.create({
        data: {
          name: "SmartRoads",
          description: "",
          defaultLatitude: 38.703202,
          defaultLongitude: -9.304298,
          gisFileVersion: "1.0",
          gisFileUrl: "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/geopackages%2Foeiras.gpkg?alt=media&token=7a9fe01e-5587-4767-b6ef-066e026fb522",
          allowVideo: true,
          allowImages: true,
        } as any,
      });

  console.log("✅ Created/Updated SmartRoads:", smartroads.id);

  // Entity 3: Tagcoders
  const existingTagcoders = await prisma.cityHall.findFirst({
    where: { name: "Tagcoders" },
  });

  const tagcoders = existingTagcoders
    ? await prisma.cityHall.update({
        where: { id: existingTagcoders.id },
        data: {
          description: "",
          defaultLatitude: 37.247820,
          defaultLongitude: 42.464575,
          gisFileVersion: "1.0",
          gisFileUrl: "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/geopackages%2Fsilopi.gpkg?alt=media&token=af80e2c0-72ff-420b-aeba-2ed112fe830d",
          allowVideo: true,
          allowImages: true,
        } as any,
      })
    : await prisma.cityHall.create({
        data: {
          name: "Tagcoders",
          description: "",
          defaultLatitude: 37.247820,
          defaultLongitude: 42.464575,
          gisFileVersion: "1.0",
          gisFileUrl: "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/geopackages%2Fsilopi.gpkg?alt=media&token=af80e2c0-72ff-420b-aeba-2ed112fe830d",
          allowVideo: true,
          allowImages: true,
        } as any,
      });

  console.log("✅ Created/Updated Tagcoders:", tagcoders.id);

  console.log("\n📋 Summary:");
  console.log(`  - Infralobo: ${infralobo.id}`);
  console.log(`  - SmartRoads: ${smartroads.id}`);
  console.log(`  - Tagcoders: ${tagcoders.id}`);
  console.log("\n✨ Pilot entities seeded successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding pilot entities:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

