import axios from "axios";
import { PrismaClient } from "@prisma/client";

const API_BASE_URL = "http://localhost:3000";
const prisma = new PrismaClient();

async function login(username = "admin", password = "admin") {
  const response = await axios.post(`${API_BASE_URL}/login`, { username, password });
  return response.data.accessToken;
}

async function testUserUpdate() {
  console.info("🧪 Testing user update functionality...");

  try {
    const adminToken = await login();

    // Find a user to update
    const user = await prisma.user.findFirst({
      where: { role: "app_user" },
    });

    if (!user) {
      console.info("❌ No app user found to test with. Please run `npm run seed` first.");
      return;
    }

    console.info(`✅ Found user to update: ${user.username} (${user.role})`);

    // Test the new update endpoint with cityHallId and roles
    const updatePayload = {
      username: user.username,
      password: "", // Empty password should not be updated
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: "app_user",
      roles: ["app_user", "dashboard_user"], // Test multiple roles
      isActive: true,
      cityHallId: user.cityHallId // Test cityHallId conversion
    };

    console.info("\n🔧 Testing user update with cityHallId and roles...");
    console.info("Update payload:", JSON.stringify(updatePayload, null, 2));

    const updateResponse = await axios.patch(
      `${API_BASE_URL}/users/${user.id}/update`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const updatedUser = updateResponse.data;
    console.info("✅ User updated successfully:");
    console.info(`   Username: ${updatedUser.username}`);
    console.info(`   Role: ${updatedUser.role}`);
    console.info(`   Roles: ${JSON.stringify(updatedUser.roles)}`);
    console.info(`   City Hall: ${updatedUser.cityHall?.name || 'None'}`);
    console.info(`   Entity: ${updatedUser.entity?.name || 'None'}`);

    // Test the userInfo endpoint
    console.info("\n🔧 Testing /userInfo endpoint...");
    const userInfoResponse = await axios.get(`${API_BASE_URL}/userInfo`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    const userInfo = userInfoResponse.data;
    console.info("✅ UserInfo endpoint working:");
    console.info(`   ID: ${userInfo.id}`);
    console.info(`   Username: ${userInfo.username}`);
    console.info(`   Roles: ${JSON.stringify(userInfo.roles)}`);

    console.info("\n🎉 User update and userInfo tests completed successfully!");
  } catch (error: any) {
    console.error("❌ Test failed:", error.response?.data || error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testUserUpdate();
