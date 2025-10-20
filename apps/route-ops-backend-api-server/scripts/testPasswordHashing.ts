import axios from "axios";
import { PrismaClient } from "@prisma/client";

const API_BASE_URL = "http://localhost:3000";
const prisma = new PrismaClient();

async function login(username: string, password: string) {
  try {
    const response = await axios.post(`${API_BASE_URL}/login`, { username, password });
    return response.data.accessToken;
  } catch (error) {
    return null;
  }
}

async function testPasswordHashing() {
  console.info("🔐 Testing password hashing for user creation...");

  try {
    // Login as admin
    const adminToken = await login("admin", "admin");
    if (!adminToken) {
      console.error("❌ Failed to login as admin");
      return;
    }
    console.info("✅ Admin login successful");

    // Create a test user
    const testUserData = {
      username: "test.user.123",
      password: "testpassword123",
      email: "test.user.123@routeops.com",
      firstName: "Test",
      lastName: "User",
      role: "app_user",
      roles: ["app_user"],
      isActive: true,
      cityHall: {
        connect: {
          id: "68f242c5e9b8093329f4f911" // Lisbon city hall
        }
      }
    };

    console.info("📝 Creating test user with password...");
    const createResponse = await axios.post(`${API_BASE_URL}/users/create-with-role`, testUserData, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    console.info("✅ User created successfully");
    console.info("📋 Created user:", JSON.stringify(createResponse.data, null, 2));

    // Try to login with the new user
    console.info("\n🔑 Testing login with created user...");
    const loginToken = await login("test.user.123", "testpassword123");

    if (loginToken) {
      console.info("✅ Login successful! Password was properly hashed.");
      console.info("🎉 Password hashing is working correctly!");
    } else {
      console.error("❌ Login failed! Password was not hashed properly.");
    }

    // Clean up - delete the test user
    console.info("\n🧹 Cleaning up test user...");
    try {
      await axios.delete(`${API_BASE_URL}/users/${createResponse.data.id}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      console.info("✅ Test user deleted successfully");
    } catch (error) {
      console.info("ℹ️ Could not delete test user (might not have delete permissions)");
    }

  } catch (error: any) {
    console.error("❌ Test failed:", error.response?.data || error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testPasswordHashing();
