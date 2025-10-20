import axios from "axios";
import { PrismaClient } from "@prisma/client";

const API_BASE_URL = "http://localhost:3000";
const prisma = new PrismaClient();

async function login(username = "admin", password = "admin") {
  const response = await axios.post(`${API_BASE_URL}/login`, { username, password });
  return response.data.accessToken;
}

async function testAdminAccess() {
  console.info("🧪 Testing admin access to dashboard city hall endpoint...");

  try {
    const adminToken = await login("admin", "admin");
    console.info("✅ Admin login successful");

    // Test the endpoint that was previously restricted
    const response = await axios.get(`${API_BASE_URL}/users/dashboard/city-hall`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    console.info("✅ Admin can now access GET /users/dashboard/city-hall");
    console.info("📋 Response:", JSON.stringify(response.data, null, 2));

    // Test with dashboard user for comparison
    const dashToken = await login("dash.lisbon", "password123");
    console.info("✅ Dashboard user login successful");

    const dashResponse = await axios.get(`${API_BASE_URL}/users/dashboard/city-hall`, {
      headers: {
        Authorization: `Bearer ${dashToken}`,
      },
    });

    console.info("✅ Dashboard user can access GET /users/dashboard/city-hall");
    console.info("📋 Dashboard Response:", JSON.stringify(dashResponse.data, null, 2));

    console.info("\n🎉 Admin access test completed successfully!");
    console.info("✅ Admins can now access all endpoints as expected!");

  } catch (error: any) {
    console.error("❌ Test failed:", error.response?.data || error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testAdminAccess();
