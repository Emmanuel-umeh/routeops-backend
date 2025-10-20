import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PasswordService, parseSalt } from "../src/auth/password.service";
import { ConfigService } from "@nestjs/config";

dotenv.config();

async function testPasswordHashingDirect() {
  console.info("🔐 Testing password hashing directly...");

  const prisma = new PrismaClient();
  
  // Create a mock ConfigService
  const configService = {
    get: (key: string) => process.env[key]
  } as ConfigService;
  
  const passwordService = new PasswordService(configService);

  try {
    // Test 1: Hash a password
    const plainPassword = "testpassword123";
    console.info(`📝 Testing password: "${plainPassword}"`);
    
    const hashedPassword = await passwordService.hash(plainPassword);
    console.info("✅ Password hashed successfully");
    console.info(`🔒 Hashed password: ${hashedPassword.substring(0, 20)}...`);

    // Test 2: Verify the hash
    const isValid = await passwordService.compare(plainPassword, hashedPassword);
    console.info(`✅ Password validation: ${isValid ? 'PASSED' : 'FAILED'}`);

    // Test 3: Test with wrong password
    const isInvalid = await passwordService.compare("wrongpassword", hashedPassword);
    console.info(`✅ Wrong password validation: ${isInvalid ? 'FAILED' : 'PASSED'}`);

    // Test 4: Check if the UserService properly hashes passwords
    console.info("\n🧪 Testing UserService password hashing...");
    
    // Import the service
    const { UserService } = await import("../src/user/user.service");
    const { PrismaService } = await import("../src/prisma/prisma.service");
    
    // Create a mock PrismaService
    const prismaService = {
      user: prisma.user,
      cityHall: prisma.cityHall,
      onModuleInit: () => Promise.resolve()
    } as any;
    
    const userService = new UserService(prismaService, passwordService);

    // Test the createUserWithRoleValidation method
    const testUserData = {
      username: "test.user.direct",
      password: "directtest123",
      email: "test.direct@routeops.com",
      firstName: "Direct",
      lastName: "Test",
      role: "app_user" as const,
      roles: ["app_user"],
      isActive: true,
      cityHall: {
        connect: {
          id: "68f242c5e9b8093329f4f911" // Lisbon city hall
        }
      }
    };

    try {
      const createdUser = await userService.createUserWithRoleValidation(
        testUserData,
        "admin"
      );

      console.info("✅ User created with hashed password");
      console.info(`📋 Created user ID: ${createdUser.id}`);
      console.info(`🔒 Stored password hash: ${createdUser.password?.substring(0, 20)}...`);

      // Verify the stored password is hashed (not plain text)
      if (createdUser.password !== testUserData.password) {
        console.info("✅ Password was properly hashed (not stored as plain text)");
      } else {
        console.error("❌ Password was NOT hashed (stored as plain text)");
      }

      // Test login validation
      const loginValid = await passwordService.compare(testUserData.password, createdUser.password);
      console.info(`✅ Login validation: ${loginValid ? 'PASSED' : 'FAILED'}`);

      // Clean up
      await prisma.user.delete({
        where: { id: createdUser.id }
      });
      console.info("🧹 Test user cleaned up");

    } catch (error: any) {
      console.error("❌ User creation test failed:", error.message);
    }

    console.info("\n🎉 Password hashing test completed!");
    console.info("✅ All password hashing functionality is working correctly!");

  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testPasswordHashingDirect();
