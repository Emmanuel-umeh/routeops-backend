import { PrismaClient } from "@prisma/client";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";
import * as dotenv from "dotenv";

dotenv.config();

export async function customSeed() {
  const client = new PrismaClient();

  // Get bcrypt salt from environment
  const { BCRYPT_SALT } = process.env;
  if (!BCRYPT_SALT) {
    throw new Error("BCRYPT_SALT environment variable must be defined");
  }
  const salt = parseSalt(BCRYPT_SALT);

  console.info("Creating sample city halls...");

  // Create Lisbon City Hall
  const lisbonCityHall = await client.cityHall.create({
    data: {
      name: "Lisbon",
      description: "Lisbon City Hall - Main administrative center",
    },
  });

  // Create Olhão City Hall
  const olhaoCityHall = await client.cityHall.create({
    data: {
      name: "Olhão",
      description: "Olhão City Hall - Regional administrative center",
    },
  });

  console.info("Creating sample dashboard user...");

  // Create a sample dashboard user for Lisbon
  let dashboardUser;
  try {
    dashboardUser = await client.user.create({
      data: {
        username: "dashboard.lisbon",
        password: await hash("password123", salt),
        role: "dashboard_user" as const,
        roles: ["dashboard_user"],
        email: "dashboard.lisbon@routeops.com",
        firstName: "Lisbon",
        lastName: "Dashboard User",
        isActive: true,
        cityHall: {
          connect: { id: lisbonCityHall.id }
        },
      },
    });
  } catch (error) {
    console.info("Dashboard user already exists, fetching existing user...");
    dashboardUser = await client.user.findUnique({
      where: { username: "dashboard.lisbon" },
    });
  }

  console.info("Creating sample app user...");

  // Create a sample app user for Lisbon
  let appUser;
  try {
    appUser = await client.user.create({
      data: {
        username: "app.lisbon",
        password: await hash("password123", salt),
        role: "app_user" as const,
        roles: ["app_user"],
        email: "app.lisbon@routeops.com",
        firstName: "Lisbon",
        lastName: "App User",
        isActive: true,
        cityHall: {
          connect: { id: lisbonCityHall.id }
        },
      },
    });
  } catch (error) {
    console.info("App user already exists, fetching existing user...");
    appUser = await client.user.findUnique({
      where: { username: "app.lisbon" },
    });
  }

  console.info("Creating sample project...");

  // Create a sample project
  let sampleProject;
  if (dashboardUser) {
    try {
      sampleProject = await client.project.create({
        data: {
          name: "Sample Road Inspection Project",
          description: "A sample project for testing the system",
          status: "active" as const,
          assignedUser: dashboardUser.id,
          createdBy: "admin",
          cityHall: {
            connect: { id: lisbonCityHall.id }
          },
        },
      });
    } catch (error) {
      console.info("Sample project already exists...");
    }
  }

  console.info("Sample data created successfully!");
  console.info(`- Admin user: admin / admin`);
  console.info(`- Dashboard user: dashboard.lisbon / password123`);
  console.info(`- App user: app.lisbon / password123`);
  console.info(`- City Halls: Lisbon, Olhão`);
  if (sampleProject) {
    console.info(`- Sample project: ${sampleProject.name}`);
  }

  client.$disconnect();
}
