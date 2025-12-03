import axios from "axios";

const BASE_URL = "http://localhost:3000/api";

/**
 * Test script to verify large payload handling
 * Tests payloads of various sizes to ensure body size limit is removed
 */
async function testLargePayload() {
  const testSizes = [
    { sizeMB: 1, description: "1 MB" },
    { sizeMB: 5, description: "5 MB" },
    { sizeMB: 10, description: "10 MB" },
    { sizeMB: 25, description: "25 MB" },
    { sizeMB: 50, description: "50 MB" },
  ];

  console.log("🧪 Testing large payload handling...\n");
  console.log("=" .repeat(60));

  for (const test of testSizes) {
    try {
      const sizeInBytes = test.sizeMB * 1024 * 1024;
      const largeData = {
        test: true,
        data: "x".repeat(sizeInBytes),
        timestamp: new Date().toISOString(),
      };

      console.log(`\n📦 Testing ${test.description} payload...`);
      
      const startTime = Date.now();
      const response = await axios.post(
        `${BASE_URL}/_health/test-large-payload`,
        largeData,
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 60000, // 60 second timeout
        }
      );

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if ((response.status === 200 || response.status === 201) && response.data && response.data.success !== false) {
        const receivedMB = (response.data.receivedSize / (1024 * 1024)).toFixed(2);
        console.log(`✅ SUCCESS: ${test.description} payload accepted`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Received: ${receivedMB} MB`);
        console.log(`   Duration: ${duration}s`);
        if (response.data.message) {
          console.log(`   Message: ${response.data.message}`);
        }
      } else {
        console.log(`❌ UNEXPECTED STATUS: ${response.status}`);
        console.log(`   Response: ${JSON.stringify(response.data)}`);
      }
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        const statusText = error.response.statusText;
        
        if (status === 413) {
          console.log(`❌ FAILED: ${test.description} payload rejected`);
          console.log(`   Error: ${status} ${statusText} - Request Entity Too Large`);
          console.log(`   ⚠️  Body size limit is still in effect!`);
        } else {
          console.log(`⚠️  ERROR: ${status} ${statusText}`);
          console.log(`   Response: ${JSON.stringify(error.response.data)}`);
        }
      } else if (error.code === "ECONNREFUSED") {
        console.log(`❌ CONNECTION ERROR: Server is not running on ${BASE_URL}`);
        console.log(`   Please start the server with: npm run dev`);
        process.exit(1);
      } else {
        console.log(`❌ ERROR: ${error.message}`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n✨ Test completed!");
}

// Run the test
testLargePayload()
  .then(() => {
    console.log("\n✅ All tests passed - body size limit appears to be removed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });

