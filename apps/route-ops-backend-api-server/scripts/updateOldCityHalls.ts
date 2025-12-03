import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Updating older city halls with default location and GIS file...");

  // Lisbon coordinates (approximate center)
  const lisbonLatitude = 38.7223;
  const lisbonLongitude = -9.1393;

  // Use one of the GIS files (faro.gpkg)
  const gisFileUrl = "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/geopackages%2Ffaro.gpkg?alt=media&token=9e4f5d1f-b061-4300-9c0b-d0c8143dbb7e";
  const gisFileVersion = "1.0";

  // Find all city halls that don't have defaultLatitude set (older ones)
  const oldCityHalls = await prisma.cityHall.findMany({
    where: {
      OR: [
        { defaultLatitude: null },
        { defaultLongitude: null },
        { gisFileUrl: null },
      ],
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (oldCityHalls.length === 0) {
    console.log("✅ No city halls need updating - all already have location/GIS data");
    return;
  }

  console.log(`Found ${oldCityHalls.length} city hall(s) to update:`);
  oldCityHalls.forEach((ch) => console.log(`  - ${ch.name} (${ch.id})`));

  // Update each city hall
  for (const cityHall of oldCityHalls) {
    const updated = await prisma.cityHall.update({
      where: { id: cityHall.id },
      data: {
        defaultLatitude: lisbonLatitude,
        defaultLongitude: lisbonLongitude,
        gisFileUrl: gisFileUrl,
        gisFileVersion: gisFileVersion,
      } as any,
    });

    console.log(`✅ Updated ${cityHall.name}:`);
    console.log(`   - Default Location: ${lisbonLatitude}, ${lisbonLongitude}`);
    console.log(`   - GIS File: ${gisFileVersion}`);
  }

  console.log("\n✨ All older city halls updated successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error updating city halls:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

