import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const BEARER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNGNlMmFhZC1mYWFkLTRiOGYtOTMxMy0xYTI3MjVkNWU0ZTYiLCJ1c2VybmFtZSI6ImRpb2dvX3RhZyIsInRva2VuVHlwZSI6ImFjY2VzcyIsImlhdCI6MTc2NTgyMzQzMCwiZXhwIjoxNzY1OTk2MjMwfQ.xF5eT2xwHe_nEttOIhMsgfWCa1BktFiEMfUUFxXVXH4";

// Get base URL from environment, command line, or use default
const BASE_URL = process.argv[3] || process.env.API_URL || process.env.BASE_URL || "http://localhost:3000";

interface PerformanceResult {
  endpoint: string;
  method: string;
  duration: number;
  status: number;
  success: boolean;
  error?: string;
  responseSize?: number;
}

async function measureEndpoint(
  method: "GET" | "POST",
  endpoint: string,
  params?: Record<string, any>
): Promise<PerformanceResult> {
  const startTime = process.hrtime.bigint();
  
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
      params: method === "GET" ? params : undefined,
      data: method === "POST" ? params : undefined,
      timeout: 30000, // 30 second timeout
      validateStatus: () => true, // Don't throw on any status code
    };

    const response = await axios(config);
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000; // Convert nanoseconds to milliseconds

    const isSuccess = response.status >= 200 && response.status < 300;

    return {
      endpoint,
      method,
      duration: durationMs,
      status: response.status,
      success: isSuccess,
      responseSize: JSON.stringify(response.data).length,
      error: isSuccess ? undefined : `HTTP ${response.status}`,
    };
  } catch (error: any) {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;

    let errorMessage = "Unknown error";
    if (error.code === "ECONNREFUSED") {
      errorMessage = `Connection refused - Is server running at ${BASE_URL}?`;
    } else if (error.code === "ETIMEDOUT") {
      errorMessage = "Request timeout";
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      endpoint,
      method,
      duration: durationMs,
      status: error.response?.status || 0,
      success: false,
      error: errorMessage,
    };
  }
}

async function testMapClickPerformance(iterations: number = 3) {
  console.info("🚀 Testing Map Click Performance");
  console.info(`📍 Base URL: ${BASE_URL}`);
  console.info(`🔄 Running ${iterations} iteration(s) for each endpoint\n`);

  // Test coordinates and parameters
  const lat = 37.2472509168706;
  const lng = 42.43722332467271;
  const edgeId = "708446261";
  const from = "2025-12-09T23:49:48.376Z";
  const to = "2025-12-15T23:49:48.376Z";

  const endpoints = [
    {
      name: "Nearest Edge",
      method: "GET" as const,
      path: `/api/roads/nearest-edge`,
      params: { lat, lng },
    },
    {
      name: "Edge Analytics",
      method: "GET" as const,
      path: `/api/surveys/edge-analytics/${edgeId}`,
      params: { from, to },
    },
    {
      name: "Road Geometries",
      method: "GET" as const,
      path: `/api/roads/geometries`,
      params: {},
    },
    {
      name: "Combined Map Click (NEW)",
      method: "GET" as const,
      path: `/api/roads/map-click-data`,
      params: { lat, lng, from, to },
    },
  ];

  const allResults: PerformanceResult[][] = [];

  // Run tests
  for (let i = 0; i < iterations; i++) {
    console.info(`\n📊 Iteration ${i + 1}/${iterations}`);
    console.info("─".repeat(60));

    const iterationResults: PerformanceResult[] = [];

    for (const endpoint of endpoints) {
      process.stdout.write(`   Testing ${endpoint.name}... `);
      const result = await measureEndpoint(endpoint.method, endpoint.path, endpoint.params);
      iterationResults.push(result);

      if (result.success) {
        console.info(`✅ ${result.duration.toFixed(2)}ms (Status: ${result.status}, Size: ${(result.responseSize! / 1024).toFixed(2)}KB)`);
      } else {
        console.info(`❌ ${result.duration.toFixed(2)}ms (Error: ${result.error})`);
      }
    }

    allResults.push(iterationResults);

    // Small delay between iterations
    if (i < iterations - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Calculate statistics
  console.info("\n\n📈 Performance Summary");
  console.info("=".repeat(60));

  endpoints.forEach((endpoint, index) => {
    const results = allResults.map((r) => r[index]);
    const successfulResults = results.filter((r) => r.success);
    const failedResults = results.filter((r) => !r.success);

    console.info(`\n${endpoint.name} (${endpoint.path})`);
    console.info("─".repeat(60));

    if (successfulResults.length > 0) {
      const durations = successfulResults.map((r) => r.duration);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      const total = durations.reduce((a, b) => a + b, 0);

      console.info(`   ✅ Successful: ${successfulResults.length}/${iterations}`);
      console.info(`   ⏱️  Average: ${avg.toFixed(2)}ms`);
      console.info(`   ⚡ Fastest: ${min.toFixed(2)}ms`);
      console.info(`   🐌 Slowest: ${max.toFixed(2)}ms`);
      console.info(`   📦 Total: ${total.toFixed(2)}ms`);
      
      if (successfulResults[0].responseSize) {
        const avgSize = successfulResults.reduce((sum, r) => sum + (r.responseSize || 0), 0) / successfulResults.length;
        console.info(`   📊 Avg Response Size: ${(avgSize / 1024).toFixed(2)}KB`);
      }
    }

    if (failedResults.length > 0) {
      console.info(`   ❌ Failed: ${failedResults.length}/${iterations}`);
      failedResults.forEach((r) => {
        console.info(`      - ${r.error} (${r.status})`);
      });
    }
  });

  // Sequential vs Parallel comparison
  console.info("\n\n🔄 Sequential vs Parallel Execution");
  console.info("=".repeat(60));

  // Sequential (current behavior)
  console.info("\n📌 Sequential Execution (Current):");
  const sequentialStart = process.hrtime.bigint();
  for (const endpoint of endpoints) {
    await measureEndpoint(endpoint.method, endpoint.path, endpoint.params);
  }
  const sequentialEnd = process.hrtime.bigint();
  const sequentialTime = Number(sequentialEnd - sequentialStart) / 1_000_000;
  console.info(`   Total Time: ${sequentialTime.toFixed(2)}ms`);

  // Parallel (potential optimization)
  console.info("\n⚡ Parallel Execution (Potential Optimization):");
  const parallelStart = process.hrtime.bigint();
  await Promise.all(
    endpoints.map((endpoint) => measureEndpoint(endpoint.method, endpoint.path, endpoint.params))
  );
  const parallelEnd = process.hrtime.bigint();
  const parallelTime = Number(parallelEnd - parallelStart) / 1_000_000;
  console.info(`   Total Time: ${parallelTime.toFixed(2)}ms`);
  console.info(`   ⚡ Speed Improvement: ${((sequentialTime - parallelTime) / sequentialTime * 100).toFixed(1)}% faster`);

  // Recommendations
  console.info("\n\n💡 Recommendations");
  console.info("=".repeat(60));

  const avgTimes = endpoints.map((endpoint, index) => {
    const results = allResults.map((r) => r[index]).filter((r) => r.success);
    return {
      name: endpoint.name,
      avg: results.length > 0 ? results.reduce((sum, r) => sum + r.duration, 0) / results.length : 0,
    };
  }).sort((a, b) => b.avg - a.avg);

  console.info("\n   Slowest to Fastest:");
  avgTimes.forEach((item, index) => {
    console.info(`   ${index + 1}. ${item.name}: ${item.avg.toFixed(2)}ms`);
  });

  if (sequentialTime > 1000) {
    console.info("\n   ⚠️  Total sequential time exceeds 1 second!");
    console.info("   💡 Consider implementing parallel requests on the frontend");
  }

  const slowestEndpoint = avgTimes[0];
  if (slowestEndpoint.avg > 500) {
    console.info(`\n   ⚠️  "${slowestEndpoint.name}" is taking ${slowestEndpoint.avg.toFixed(2)}ms`);
    console.info("   💡 Consider optimizing this endpoint (caching, indexing, query optimization)");
  }

  console.info("\n");
}

// Run the test
if (require.main === module) {
  const iterations = process.argv[2] ? parseInt(process.argv[2], 10) : 3;
  testMapClickPerformance(iterations).catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });
}
