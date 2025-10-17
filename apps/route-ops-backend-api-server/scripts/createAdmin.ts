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

  createAdminUser(salt).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function createAdminUser(bcryptSalt: Salt) {
  console.info("Creating admin user...");

  const client = new PrismaClient();

  try {
    // Get command line arguments for username and password
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
    console.info(`Username: ${adminUser.username}`);
    console.info(`Email: ${adminUser.email}`);
    console.info(`Role: ${adminUser.role}`);
    console.info(`Active: ${adminUser.isActive}`);
    console.info("");
    console.info("🔐 Login credentials:");
    console.info(`Username: ${username}`);
    console.info(`Password: ${password}`);
    console.info("");
    console.info("📝 Usage:");
    console.info("npm run create-admin [username] [password] [email]");
    console.info("Example: npm run create-admin admin admin123 admin@routeops.com");

  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    throw error;
  } finally {
    await client.$disconnect();
  }
}
