import axios from "axios";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const API_BASE_URL = "http://localhost:3000";
const prisma = new PrismaClient();

async function login(username = "admin", password = "admin") {
  const response = await axios.post(`${API_BASE_URL}/login`, { username, password });
  return response.data.accessToken;
}

async function testPasswordUpdate() {
  console.info("🧪 Testing password update functionality...");

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
    console.info(`   Current password hash: ${user.password.substring(0, 20)}...`);

    const newPassword = "newpassword123";
    const updatePayload = {
      username: user.username,
      password: newPassword, // Test password update
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      roles: user.roles,
      isActive: user.isActive,
      cityHallId: user.cityHallId
    };

    console.info("\n🔧 Testing password update...");
    console.info(`   New password: ${newPassword}`);

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
    console.info("✅ User updated successfully");

    // Check if password was hashed
    const userAfterUpdate = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!userAfterUpdate) {
      console.error("❌ User not found after update");
      return;
    }

    console.info(`   New password hash: ${userAfterUpdate.password.substring(0, 20)}...`);

    // Verify the password was hashed (not stored as plain text)
    if (userAfterUpdate.password === newPassword) {
      console.error("❌ Password was NOT hashed! It's stored as plain text.");
      return;
    }

    // Verify the password can be used to login
    const isPasswordValid = await bcrypt.compare(newPassword, userAfterUpdate.password);
    if (!isPasswordValid) {
      console.error("❌ Password hash is invalid! Cannot verify with bcrypt.");
      return;
    }

    console.info("✅ Password was properly hashed and can be verified");

    // Test login with new password
    try {
      const loginResponse = await axios.post(`${API_BASE_URL}/login`, {
        username: user.username,
        password: newPassword
      });
      console.info("✅ Login with new password successful");
    } catch (loginError: any) {
      console.error("❌ Login with new password failed:", loginError.response?.data);
      return;
    }

    // Test empty password (should not update password)
    console.info("\n🔧 Testing empty password (should not update password)...");
    const emptyPasswordPayload = {
      ...updatePayload,
      password: "", // Empty password
      firstName: "Updated Name"
    };

    const emptyPasswordResponse = await axios.patch(
      `${API_BASE_URL}/users/${user.id}/update`,
      emptyPasswordPayload,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const userAfterEmptyPassword = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!userAfterEmptyPassword) {
      console.error("❌ User not found after empty password update");
      return;
    }

    // Password should remain the same (not updated)
    if (userAfterEmptyPassword.password !== userAfterUpdate.password) {
      console.error("❌ Password was updated when it should have been ignored (empty password)");
      return;
    }

    console.info("✅ Empty password was correctly ignored");
    console.info(`   First name updated: ${userAfterEmptyPassword.firstName}`);

    console.info("\n🎉 Password update tests completed successfully!");
    console.info("✅ Passwords are properly hashed before saving");
    console.info("✅ Empty passwords are ignored (not updated)");
    console.info("✅ Updated passwords work for login");

  } catch (error: any) {
    console.error("❌ Test failed:", error.response?.data || error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testPasswordUpdate();
