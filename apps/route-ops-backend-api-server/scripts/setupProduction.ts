import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

if (require.main === module) {
  dotenv.config();

  const { BCRYPT_SALT } = process.env;

  if (!BCRYPT_SALT) {
    throw new Error("BCRYPT_SALT environment variable must be defined");
  }
  const salt = parseSalt(BCRYPT_SALT);

  setupProduction(salt).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function setupProduction(bcryptSalt: Salt) {
  console.info("🚀 Setting up production database...");
  console.info("");

  const client = new PrismaClient();

  try {
    // Step 1: Create admin user
    console.info("📝 Step 1: Creating admin user...");
    const args = process.argv.slice(2);
    const username = args[0] || "admin";
    const password = args[1] || "admin";
    const email = args[2] || `${username}@routeops.com`;

    const hashedPassword = await hash(password, bcryptSalt);

    const adminData = {
      username,
      password: hashedPassword,
      role: "admin" as const,
      roles: ["admin"],
      email,
      firstName: "System",
      lastName: "Administrator",
      isActive: true,
    };

    const adminUser = await client.user.upsert({
      where: {
        username: adminData.username,
      },
      update: {
        password: adminData.password,
        role: adminData.role,
        roles: adminData.roles,
        email: adminData.email,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        isActive: adminData.isActive,
      },
      create: adminData,
    });

    console.info("✅ Admin user created/updated successfully!");
    console.info(`   Username: ${adminUser.username}`);
    console.info(`   Email: ${adminUser.email}`);
    console.info(`   Role: ${adminUser.role}`);
    console.info("");

    // Step 2: Create default CityHall entities
    console.info("📝 Step 2: Creating default CityHall entities...");

    const cityHalls = [
      {
        name: "Infralobo",
        defaultLatitude: 37.060899,
        defaultLongitude: -8.064873,
        gisFileUrl:
          "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/geopackages%2Ffaro.gpkg?alt=media&token=9e4f5d1f-b061-4300-9c0b-d0c8143dbb7e",
        gisFileVersion: "1.0",
        description: "Infralobo City Hall",
      },
      {
        name: "SmartRoads",
        defaultLatitude: 38.703202,
        defaultLongitude: -9.304298,
        gisFileUrl:
          "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/geopackages%2Foeiras.gpkg?alt=media&token=7a9fe01e-5587-4767-b6ef-066e026fb522",
        gisFileVersion: "1.0",
        description: "SmartRoads City Hall",
      },
      {
        name: "Tagcoders",
        defaultLatitude: 37.247820,
        defaultLongitude: 42.464575,
        gisFileUrl:
          "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/geopackages%2Fsilopi.gpkg?alt=media&token=af80e2c0-72ff-420b-aeba-2ed112fe830d",
        gisFileVersion: "1.0",
        description: "Tagcoders City Hall",
      },
    ];

    const createdCityHalls = [];

    for (const cityHallData of cityHalls) {
      // Check if CityHall with this name already exists
      const existingCityHall = await client.cityHall.findFirst({
        where: {
          name: cityHallData.name,
        },
      });

      let cityHall;
      if (existingCityHall) {
        // Update existing CityHall
        cityHall = await client.cityHall.update({
          where: {
            id: existingCityHall.id,
          },
          data: {
            defaultLatitude: cityHallData.defaultLatitude,
            defaultLongitude: cityHallData.defaultLongitude,
            gisFileUrl: cityHallData.gisFileUrl,
            gisFileVersion: cityHallData.gisFileVersion,
            description: cityHallData.description,
          },
        });
        console.info(`✅ Updated CityHall: ${cityHall.name}`);
      } else {
        // Create new CityHall
        cityHall = await client.cityHall.create({
          data: cityHallData,
        });
        console.info(`✅ Created CityHall: ${cityHall.name}`);
      }

      createdCityHalls.push(cityHall);
      console.info(`   Location: ${cityHall.defaultLatitude}, ${cityHall.defaultLongitude}`);
      console.info(`   GIS Version: ${cityHall.gisFileVersion}`);
    }

    console.info("");
    console.info("🎉 Production setup completed successfully!");
    console.info("");
    console.info("📋 Summary:");
    console.info(`   - Admin user: ${adminUser.username} / ${password}`);
    console.info(`   - CityHalls created: ${createdCityHalls.length}`);
    createdCityHalls.forEach((ch) => {
      console.info(`     • ${ch.name}`);
    });
    console.info("");
    console.info("📝 Usage:");
    console.info("npm run setup:production [username] [password] [email]");
    console.info("Example: npm run setup:production admin admin123 admin@routeops.com");
  } catch (error) {
    console.error("❌ Error setting up production:", error);
    throw error;
  } finally {
    await client.$disconnect();
  }
}


