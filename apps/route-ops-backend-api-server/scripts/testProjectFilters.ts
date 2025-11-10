import axios from "axios";
import * as dotenv from "dotenv";
import { PrismaClient, EnumProjectStatus } from "@prisma/client";

dotenv.config();

const BASE_URL = process.env.API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000/api";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin";

const prisma = new PrismaClient();

interface LoginResponse {
  accessToken: string;
  id: string;
  username: string;
  roles: string[];
}

interface ProjectResponse {
  id: string;
  status: EnumProjectStatus | null;
  createdBy: string | null;
  surveys: Array<{
    startTime: string | null;
    endTime: string | null;
    eIriAvg: number | null;
  }>;
}

interface ProjectFilters {
  startDate?: Date;
  endDate?: Date;
  eiriMin?: number;
  eiriMax?: number;
  operator?: string;
  status?: EnumProjectStatus;
}

async function login(): Promise<string> {
  const { data } = await axios.post<LoginResponse>(`${BASE_URL}/login`, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
  return data.accessToken;
}

function formatDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

async function fetchProjects(token: string, params: Record<string, any>): Promise<ProjectResponse[]> {
  const { data } = await axios.get<ProjectResponse[]>(`${BASE_URL}/projects`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params,
  });
  return data;
}

async function testStatusFilter(token: string): Promise<void> {
  const projectWithStatus = await prisma.project.findFirst({
    where: { status: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });

  if (!projectWithStatus?.status) {
    console.log("⚠️  Skipping status filter test (no projects with status).");
    return;
  }

  const status = projectWithStatus.status;
  const projects = await fetchProjects(token, { status });

  if (projects.length === 0) {
    throw new Error(`Status filter returned no results for ${status}.`);
  }

  const invalid = projects.filter((project) => project.status?.toLowerCase() !== status.toLowerCase());
  if (invalid.length > 0) {
    throw new Error(`Status filter mismatch. Expected ${status}, got projects with statuses: ${invalid.map((p) => p.status).join(", ")}`);
  }

  console.log(`✅ Status filter passed (${status})`);
}

async function testOperatorFilter(token: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { createdBy: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { createdBy: true },
  });

  if (!project?.createdBy) {
    console.log("⚠️  Skipping operator filter test (no projects with createdBy).");
    return;
  }

  const operator = project.createdBy;
  const projects = await fetchProjects(token, { operator });

  if (projects.length === 0) {
    throw new Error(`Operator filter returned no results for operator ${operator}.`);
  }

  const invalid = projects.filter((p) => p.createdBy !== operator);
  if (invalid.length > 0) {
    throw new Error(`Operator filter mismatch. Expected creator ${operator}, got projects created by: ${invalid.map((p) => p.createdBy).join(", ")}`);
  }

  console.log(`✅ Operator filter passed (${operator})`);
}

async function testDateRangeFilter(token: string): Promise<void> {
  const survey = await prisma.survey.findFirst({
    where: { startTime: { not: null } },
    orderBy: { startTime: "desc" },
    select: {
      projectId: true,
      startTime: true,
    },
  });

  if (!survey?.startTime) {
    console.log("⚠️  Skipping date range filter test (no surveys with startTime).");
    return;
  }

  const start = new Date(survey.startTime);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const params = {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };

  const projects = await fetchProjects(token, params);

  if (projects.length === 0) {
    throw new Error("Date range filter returned no results.");
  }

  const offending = projects.filter((project) => {
    if (!project.surveys?.length) {
      return true;
    }
    return project.surveys.every((survey) => {
      if (!survey.startTime) return true;
      const surveyDate = new Date(survey.startTime);
      return surveyDate < start || surveyDate > end;
    });
  });

  if (offending.length > 0) {
    throw new Error(`Date range filter mismatch. Returned projects outside of ${params.startDate} - ${params.endDate}`);
  }

  console.log(`✅ Date range filter passed (${params.startDate} - ${params.endDate})`);
}

async function testEiriRangeFilter(token: string): Promise<void> {
  const survey = await prisma.survey.findFirst({
    where: { eIriAvg: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: {
      eIriAvg: true,
    },
  });

  if (survey?.eIriAvg == null) {
    console.log("⚠️  Skipping eIRI filter test (no surveys with eIriAvg).");
    return;
  }

  const center = survey.eIriAvg;
  const min = Math.max(0, Math.floor(center * 10) / 10 - 0.5);
  const max = Math.floor(center * 10) / 10 + 0.5;

  const projects = await fetchProjects(token, {
    eiriMin: min,
    eiriMax: max,
  });

  if (projects.length === 0) {
    throw new Error(`eIRI filter returned no results for range ${min} - ${max}.`);
  }

  const offending = projects.filter((project) => {
    if (!project.surveys?.length) {
      return true;
    }
    return project.surveys.every((survey) => {
      if (survey.eIriAvg == null) return true;
      return survey.eIriAvg < min || survey.eIriAvg > max;
    });
  });

  if (offending.length > 0) {
    throw new Error(`eIRI filter mismatch. Returned projects outside of range ${min} - ${max}.`);
  }

  console.log(`✅ eIRI range filter passed (${min} - ${max})`);
}

async function testCombinedFilters(token: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: {
      createdBy: { not: null },
      status: { not: null },
      surveys: {
        some: {
          startTime: { not: null },
          eIriAvg: { not: null },
        },
      },
    },
    include: {
      surveys: {
        where: {
          startTime: { not: null },
          eIriAvg: { not: null },
        },
        orderBy: { startTime: "desc" },
        take: 1,
      },
    },
  });

  if (!project || project.surveys.length === 0) {
    console.log("⚠️  Skipping combined filters test (insufficient project data).");
    return;
  }

  const [survey] = project.surveys;
  const start = new Date(survey.startTime!);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const params = {
    status: project.status!,
    operator: project.createdBy!,
    startDate: formatDate(start),
    endDate: formatDate(end),
    eiriMin: Math.max(0, survey.eIriAvg! - 1),
    eiriMax: survey.eIriAvg! + 1,
  };

  const projects = await fetchProjects(token, params);

  if (projects.length === 0) {
    throw new Error("Combined filters returned no results.");
  }

  const offending = projects.filter((p) => {
    const statusMismatch = p.status?.toLowerCase() !== params.status.toLowerCase();
    const operatorMismatch = p.createdBy !== params.operator;
    const hasSurveyInRange =
      p.surveys?.some((s) => {
        if (!s.startTime || s.eIriAvg == null) return false;
        const date = new Date(s.startTime);
        return (
          date >= start &&
          date <= end &&
          s.eIriAvg >= params.eiriMin &&
          s.eIriAvg <= params.eiriMax
        );
      }) ?? false;
    return statusMismatch || operatorMismatch || !hasSurveyInRange;
  });

  if (offending.length > 0) {
    throw new Error("Combined filter mismatch. One or more returned projects do not satisfy all filters.");
  }

  console.log("✅ Combined filters passed");
}

async function run(): Promise<void> {
  console.log("🧪 Testing project filters...\n");
  try {
    const token = await login();
    console.log("🔑 Logged in successfully.\n");

    await testStatusFilter(token);
    await testOperatorFilter(token);
    await testDateRangeFilter(token);
    await testEiriRangeFilter(token);
    await testCombinedFilters(token);

    console.log("\n🎉 All filter tests passed!");
  } catch (error: any) {
    console.error("❌ Filter tests failed:", error?.message ?? error);
    if (axios.isAxiosError(error)) {
      console.error("   Response status:", error.response?.status);
      console.error("   Response data:", JSON.stringify(error.response?.data, null, 2));
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  run();
}

