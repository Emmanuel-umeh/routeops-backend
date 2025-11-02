import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import { hash } from "bcrypt";
import { parseSalt } from "../src/auth/password.service";

dotenv.config();

const prisma = new PrismaClient();

// Helper to create LineString geometry
function createLineString(coords: [number, number][]): any {
  return {
    type: "LineString",
    coordinates: coords,
  };
}

// Helper to calculate bbox
function calculateBbox(coords: [number, number][]): [number, number, number, number] {
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
}

async function main() {
  console.log("🌱 Seeding test data...");

  // 1. Create Entities (City Halls)
  console.log("Creating entities...");
  const entity1 = await prisma.cityHall.upsert({
    where: { id: "entity-1" },
    update: {},
    create: {
      id: "entity-1",
      name: "Lisbon Municipality",
      description: "Main city hall for Lisbon",
      allowVideo: true,
      allowImages: true,
    },
  });

  const entity2 = await prisma.cityHall.upsert({
    where: { id: "entity-2" },
    update: {},
    create: {
      id: "entity-2",
      name: "Porto Municipality",
      description: "Main city hall for Porto",
      allowVideo: true,
      allowImages: true,
    },
  });

  console.log("✅ Created entities:", entity1.name, entity2.name);

  // 2. Create Users (only if they don't exist)
  console.log("Checking users...");
  let adminUser = await prisma.user.findUnique({ where: { username: "admin" } });
  let dashboardUser = await prisma.user.findUnique({ where: { username: "dashboard_user" } });
  let appUser = await prisma.user.findUnique({ where: { username: "app_user" } });

  if (!adminUser || !dashboardUser || !appUser) {
    const { BCRYPT_SALT } = process.env;
    if (!BCRYPT_SALT) {
      throw new Error("BCRYPT_SALT environment variable must be defined");
    }
    const salt = parseSalt(BCRYPT_SALT);
    const hashedPassword = await hash("password123", salt);

    if (!adminUser) {
      console.log("Creating admin user...");
      adminUser = await prisma.user.create({
        data: {
          username: "admin",
          password: hashedPassword,
          email: "admin@routeops.com",
          firstName: "System",
          lastName: "Administrator",
          role: "admin",
          roles: ["admin"],
          isActive: true,
        },
      });
      console.log("✅ Created admin user");
    } else {
      console.log("⏭️  Admin user already exists, skipping");
    }

    if (!dashboardUser) {
      console.log("Creating dashboard user...");
      dashboardUser = await prisma.user.create({
        data: {
          username: "dashboard_user",
          password: hashedPassword,
          email: "dashboard@routeops.com",
          firstName: "Dashboard",
          lastName: "User",
          role: "dashboard_user",
          roles: ["dashboard_user"],
          isActive: true,
          cityHallId: entity1.id,
        },
      });
      console.log("✅ Created dashboard user");
    } else {
      console.log("⏭️  Dashboard user already exists, skipping");
    }

    if (!appUser) {
      console.log("Creating app user...");
      appUser = await prisma.user.create({
        data: {
          username: "app_user",
          password: hashedPassword,
          email: "app@routeops.com",
          firstName: "Mobile",
          lastName: "Inspector",
          role: "app_user",
          roles: ["app_user"],
          isActive: true,
          cityHallId: entity1.id,
        },
      });
      console.log("✅ Created app user");
    } else {
      console.log("⏭️  App user already exists, skipping");
    }
  } else {
    console.log("⏭️  All users already exist, skipping user creation");
  }

  // 3. Create Projects with Surveys (different eIRI values for color testing)
  console.log("Creating projects with surveys...");

  // Project 1: Good road (Green - low eIRI)
  const project1Coords: [number, number][] = [
    [-9.1605, 38.7369], // Lisbon area
    [-9.1582, 38.7376],
    [-9.1563, 38.7384],
    [-9.1547, 38.7390],
    [-9.1530, 38.7395],
  ];

  const project1 = await prisma.project.create({
    data: {
      name: "Avenida da Liberdade Inspection",
      description: "Road inspection on Avenida da Liberdade - Good condition",
      status: "completed",
      createdBy: appUser.id,
      cityHallId: entity1.id,
    },
  });

  const survey1 = await prisma.survey.create({
    data: {
      projectId: project1.id,
      name: "Survey - Avenida da Liberdade",
      status: "Completed",
      startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      endTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2 hours later
      geometryJson: createLineString(project1Coords),
      bbox: calculateBbox(project1Coords),
      eIriAvg: 1.5, // Good road - GREEN
      lengthMeters: 850,
    },
  });

  // Add hazards for project 1
  await prisma.hazard.createMany({
    data: [
      {
        projectId: project1.id,
        latitude: 38.7376,
        longitude: -9.1582,
        severity: "low",
        typeField: "crack",
        description: "Minor surface crack",
        imageUrl: "https://www.thestatesman.com/wp-content/uploads/2020/04/googl_ED.jpg",
        createdBy: appUser.id,
      },
    ],
  });

  console.log("✅ Created project 1 (Green road):", project1.name);

  // Project 2: Medium road (Yellow - medium eIRI)
  const project2Coords: [number, number][] = [
    [-9.1400, 38.7223],
    [-9.1385, 38.7230],
    [-9.1370, 38.7235],
    [-9.1355, 38.7240],
    [-9.1340, 38.7245],
    [-9.1325, 38.7250],
  ];

  const project2 = await prisma.project.create({
    data: {
      name: "Rua de Santa Catarina Inspection",
      description: "Road inspection on Rua de Santa Catarina - Medium condition",
      status: "completed",
      createdBy: appUser.id,
      cityHallId: entity1.id,
    },
  });

  const survey2 = await prisma.survey.create({
    data: {
      projectId: project2.id,
      name: "Survey - Rua de Santa Catarina",
      status: "Completed",
      startTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      endTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // 3 hours later
      geometryJson: createLineString(project2Coords),
      bbox: calculateBbox(project2Coords),
      eIriAvg: 2.5, // Medium road - YELLOW
      lengthMeters: 1200,
    },
  });

  // Add hazards for project 2
  await prisma.hazard.createMany({
    data: [
      {
        projectId: project2.id,
        latitude: 38.7230,
        longitude: -9.1385,
        severity: "medium",
        typeField: "pothole",
        description: "Medium-sized pothole",
        imageUrl: "https://www.thestatesman.com/wp-content/uploads/2020/04/googl_ED.jpg",
        createdBy: appUser.id,
      },
      {
        projectId: project2.id,
        latitude: 38.7240,
        longitude: -9.1355,
        severity: "low",
        typeField: "crack",
        description: "Surface crack",
        imageUrl: "https://www.thestatesman.com/wp-content/uploads/2020/04/googl_ED.jpg",
        createdBy: appUser.id,
      },
    ],
  });

  console.log("✅ Created project 2 (Yellow road):", project2.name);

  // Project 3: Bad road (Red - high eIRI)
  const project3Coords: [number, number][] = [
    [-9.1300, 38.7150],
    [-9.1285, 38.7155],
    [-9.1270, 38.7160],
    [-9.1255, 38.7165],
    [-9.1240, 38.7170],
    [-9.1225, 38.7175],
    [-9.1210, 38.7180],
  ];

  const project3 = await prisma.project.create({
    data: {
      name: "Estrada de Benfica Inspection",
      description: "Road inspection on Estrada de Benfica - Poor condition",
      status: "completed",
      createdBy: appUser.id,
      cityHallId: entity1.id,
    },
  });

  const survey3 = await prisma.survey.create({
    data: {
      projectId: project3.id,
      name: "Survey - Estrada de Benfica",
      status: "Completed",
      startTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      endTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000), // 4 hours later
      geometryJson: createLineString(project3Coords),
      bbox: calculateBbox(project3Coords),
      eIriAvg: 4.2, // Bad road - RED
      lengthMeters: 2100,
    },
  });

  // Add hazards for project 3
  await prisma.hazard.createMany({
    data: [
      {
        projectId: project3.id,
        latitude: 38.7155,
        longitude: -9.1285,
        severity: "high",
        typeField: "pothole",
        description: "Large pothole - needs immediate repair",
        imageUrl: "https://www.thestatesman.com/wp-content/uploads/2020/04/googl_ED.jpg",
        createdBy: appUser.id,
      },
      {
        projectId: project3.id,
        latitude: 38.7165,
        longitude: -9.1255,
        severity: "high",
        typeField: "pothole",
        description: "Deep pothole",
        imageUrl: "https://www.thestatesman.com/wp-content/uploads/2020/04/googl_ED.jpg",
        createdBy: appUser.id,
      },
      {
        projectId: project3.id,
        latitude: 38.7175,
        longitude: -9.1225,
        severity: "medium",
        typeField: "crack",
        description: "Large surface crack",
        imageUrl: "https://www.thestatesman.com/wp-content/uploads/2020/04/googl_ED.jpg",
        createdBy: appUser.id,
      },
    ],
  });

  console.log("✅ Created project 3 (Red road):", project3.name);

  // Project 4: Active project (from mobile app) - with survey
  const project4Coords: [number, number][] = [
    [-9.1200, 38.7100],
    [-9.1195, 38.7105],
    [-9.1190, 38.7110],
    [-9.1185, 38.7115],
  ];

  const project4 = await prisma.project.create({
    data: {
      name: "Mobile Project - In Progress",
      description: "Active inspection project",
      status: "active",
      createdBy: appUser.id,
      cityHallId: entity1.id,
      routePoints: {
        create: [
          { latitude: 38.7100, longitude: -9.1200, timestamp: Math.floor(Date.now() / 1000) },
          { latitude: 38.7105, longitude: -9.1195, timestamp: Math.floor(Date.now() / 1000) + 1 },
        ],
      },
    },
  });

  const survey4 = await prisma.survey.create({
    data: {
      projectId: project4.id,
      name: "Survey - Mobile Project",
      status: "Completed",
      startTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      endTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000), // 1 hour later
      geometryJson: createLineString(project4Coords),
      bbox: calculateBbox(project4Coords),
      eIriAvg: 2.1, // Medium road - YELLOW
      lengthMeters: 450,
    },
  });

  // Add a hazard for project 4
  await prisma.hazard.create({
    data: {
      projectId: project4.id,
      latitude: 38.7110,
      longitude: -9.1190,
      severity: "medium",
      typeField: "crack",
      description: "Surface crack found during inspection",
      imageUrl: "https://www.thestatesman.com/wp-content/uploads/2020/04/googl_ED.jpg",
      createdBy: appUser.id,
    },
  });

  console.log("✅ Created project 4 (Active with survey):", project4.name);

  // Project 5: Porto entity project
  const project5Coords: [number, number][] = [
    [-8.6291, 41.1579], // Porto area
    [-8.6275, 41.1585],
    [-8.6260, 41.1590],
    [-8.6245, 41.1595],
  ];

  const project5 = await prisma.project.create({
    data: {
      name: "Avenida dos Aliados Inspection",
      description: "Road inspection in Porto",
      status: "completed",
      createdBy: appUser.id,
      cityHallId: entity2.id,
    },
  });

  const survey5 = await prisma.survey.create({
    data: {
      projectId: project5.id,
      name: "Survey - Avenida dos Aliados",
      status: "Completed",
      startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      endTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
      geometryJson: createLineString(project5Coords),
      bbox: calculateBbox(project5Coords),
      eIriAvg: 1.8, // Good road - GREEN
      lengthMeters: 650,
    },
  });

  await prisma.hazard.create({
    data: {
      projectId: project5.id,
      latitude: 41.1585,
      longitude: -8.6275,
      severity: "low",
      typeField: "crack",
      description: "Minor crack",
      imageUrl: "https://www.thestatesman.com/wp-content/uploads/2020/04/googl_ED.jpg",
      createdBy: appUser.id,
    },
  });

  console.log("✅ Created project 5 (Porto):", project5.name);

  console.log("\n🎉 Test data seeded successfully!");
  console.log("\n📊 Summary:");
  console.log(`   - Entities: ${entity1.name}, ${entity2.name}`);
  console.log(`   - Users: admin, dashboard_user, app_user (password: password123)`);
  console.log(`   - Projects: 5 total (all with surveys)`);
  console.log(`     * 4 completed projects with surveys (Green, Yellow, Red eIRI)`);
  console.log(`     * 1 active project with survey (mobile app)`);
  console.log(`     * 1 Porto entity project`);
  console.log(`   - Surveys: 5 with geometry data`);
  console.log(`   - Hazards: 9 total`);
  console.log("\n🎨 eIRI Color Coding:");
  console.log("   - Green (< 2.0): Project 1 (1.5), Project 5 (1.8)");
  console.log("   - Yellow (2.0-3.0): Project 2 (2.5), Project 4 (2.1)");
  console.log("   - Red (> 3.0): Project 3 (4.2)");
  console.log("\n🧪 Test Credentials:");
  console.log("   - Admin: admin / password123");
  console.log("   - Dashboard User: dashboard_user / password123");
  console.log("   - App User: app_user / password123");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

