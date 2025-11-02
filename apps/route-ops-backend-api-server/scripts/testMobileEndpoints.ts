import axios from "axios";

const BASE_URL = "http://localhost:3000/api";

interface LoginResponse {
  accessToken: string;
  id: string;
  username: string;
  roles: string[];
}

async function testMobileEndpoints() {
  console.log("🧪 Testing Mobile Endpoints\n");

  try {
    // Step 1: Login to get token
    console.log("1️⃣ Logging in as app_user...");
    const loginResponse = await axios.post<LoginResponse>(`${BASE_URL}/login`, {
      username: "app_user",
      password: "password123",
    });
    const token = loginResponse.data.accessToken;
    const userId = loginResponse.data.id;
    console.log(`✅ Login successful! User ID: ${userId}\n`);

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // Step 2: Get mobile user
    console.log("2️⃣ Testing GET /mobile/user");
    try {
      const userResponse = await axios.get(`${BASE_URL}/mobile/user`, { headers });
      console.log("✅ GET /mobile/user:", JSON.stringify(userResponse.data, null, 2));
    } catch (error: any) {
      console.log("❌ GET /mobile/user failed:", error.response?.data || error.message);
    }
    console.log("");

    // Step 3: Get entity (use entityId from user response)
    console.log("3️⃣ Testing GET /mobile/entity/:id");
    let entityId: string | null = null;
    try {
      const userResponse = await axios.get(`${BASE_URL}/mobile/user`, { headers });
      entityId = userResponse.data.entityId;
      if (entityId) {
        const entityResponse = await axios.get(`${BASE_URL}/mobile/entity/${entityId}`, { headers });
        console.log("✅ GET /mobile/entity/:id:", JSON.stringify(entityResponse.data, null, 2));
      } else {
        console.log("⚠️  User has no entityId, skipping entity test");
      }
    } catch (error: any) {
      console.log("❌ GET /mobile/entity/:id failed:", error.response?.data || error.message);
    }
    console.log("");

    // Step 4: Get supported area
    console.log("5️⃣ Testing GET /mobile/entity/supported-area/:version");
    try {
      const supportedAreaResponse = await axios.get(`${BASE_URL}/mobile/entity/supported-area/v1.0`, { headers });
      console.log("✅ GET /mobile/entity/supported-area/:version:", JSON.stringify(supportedAreaResponse.data, null, 2));
    } catch (error: any) {
      console.log("❌ GET /mobile/entity/supported-area/:version failed:", error.response?.data || error.message);
    }
    console.log("");

    // Step 5: Start project
    console.log("6️⃣ Testing POST /mobile/project/start");
    let projectId: string | null = null;
    try {
      const startProjectData = {
        lat: 38.7223,
        lng: -9.1393,
        date: new Date().toISOString(),
        remarks: "Starting test project from mobile app",
      };
      const startResponse = await axios.post(`${BASE_URL}/mobile/project/start`, startProjectData, { headers });
      projectId = startResponse.data.projectId;
      console.log("✅ POST /mobile/project/start:", JSON.stringify(startResponse.data, null, 2));
      console.log(`   Project ID: ${projectId}`);
    } catch (error: any) {
      console.log("❌ POST /mobile/project/start failed:", error.response?.data || error.message);
      if (error.response?.data) {
        console.log("   Full error:", JSON.stringify(error.response.data, null, 2));
      }
      return; // Can't continue without project
    }
    console.log("");

    if (!projectId) {
      console.log("⚠️  No project ID, skipping remaining tests");
      return;
    }

    // Step 6: Get project status
    console.log("7️⃣ Testing GET /mobile/project/:id/status");
    try {
      const statusResponse = await axios.get(`${BASE_URL}/mobile/project/${projectId}/status`, { headers });
      console.log("✅ GET /mobile/project/:id/status:", JSON.stringify(statusResponse.data, null, 2));
    } catch (error: any) {
      console.log("❌ GET /mobile/project/:id/status failed:", error.response?.data || error.message);
    }
    console.log("");

    // Step 7: Upload attachments
    console.log("8️⃣ Testing POST /mobile/attachments");
    try {
      const attachmentsData = {
        projectId,
        type: "image",
        files: ["file1.jpg", "file2.jpg"],
      };
      const attachmentsResponse = await axios.post(`${BASE_URL}/mobile/attachments`, attachmentsData, { headers });
      console.log("✅ POST /mobile/attachments:", JSON.stringify(attachmentsResponse.data, null, 2));
    } catch (error: any) {
      console.log("❌ POST /mobile/attachments failed:", error.response?.data || error.message);
    }
    console.log("");

    // Step 8: End project
    console.log("9️⃣ Testing POST /mobile/project/end");
    try {
      const endProjectData = {
        projectId,
        numAttachments: { images: 2, video: 0 },
        geometry: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [-9.1393, 38.7223],
              },
              properties: {
                eIri: 2.5,
              },
            },
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [-9.1380, 38.7230],
              },
              properties: {
                eIri: 3.0,
              },
            },
          ],
        },
        anomalies: [
          {
            lat: 38.7225,
            lng: -9.1390,
            remarks: "Surface crack detected",
            severity: "medium",
          },
        ],
      };
      const endResponse = await axios.post(`${BASE_URL}/mobile/project/end`, endProjectData, { headers });
      console.log("✅ POST /mobile/project/end:", JSON.stringify(endResponse.data, null, 2));
    } catch (error: any) {
      console.log("❌ POST /mobile/project/end failed:", error.response?.data || error.message);
      if (error.response?.data) {
        console.log("   Full error:", JSON.stringify(error.response.data, null, 2));
      }
    }
    console.log("");

    console.log("✅ All mobile endpoint tests completed!");
  } catch (error: any) {
    console.error("❌ Test suite failed:", error.message);
    if (error.response) {
      console.error("   Status:", error.response.status);
      console.error("   Data:", JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testMobileEndpoints();

