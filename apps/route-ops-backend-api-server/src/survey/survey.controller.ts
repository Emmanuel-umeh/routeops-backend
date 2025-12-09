import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { SurveyService } from "./survey.service";
import { SurveyControllerBase } from "./base/survey.controller.base";
import { ApiOkResponse, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { EnumProjectStatus } from "../project/base/EnumProjectStatus";
import {
  getString,
  parseDate,
  parseNumber,
  extractEiriRange,
  parseStatus,
} from "../util/filter.util";
import { PrismaService } from "../prisma/prisma.service";
import { Request } from "express";

@swagger.ApiTags("surveys")
@common.Controller("surveys")
export class SurveyController extends SurveyControllerBase {
  constructor(
    protected readonly service: SurveyService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder,
    private readonly prisma: PrismaService
  ) {
    super(service, rolesBuilder);
  }

  @common.Get("map")
  @ApiOperation({ summary: "List surveys for map within bbox and time window" })
  @ApiQuery({ name: "bbox", required: true, description: "minLng,minLat,maxLng,maxLat" })
  @ApiQuery({ name: "months", required: false, description: "Lookback window in months (default 6)" })
  @ApiQuery({ name: "startDate", required: false, description: "Start date filter (DD/MM/YYYY)" })
  @ApiQuery({ name: "endDate", required: false, description: "End date filter (DD/MM/YYYY)" })
  @ApiQuery({ name: "eiriMin", required: false, description: "Minimum eIRI value" })
  @ApiQuery({ name: "eiriMax", required: false, description: "Maximum eIRI value" })
  @ApiQuery({ name: "eiriRange", required: false, description: "eIRI range (e.g., '0-1.5')" })
  @ApiQuery({ name: "operator", required: false, description: "Filter by operator (project creator)" })
  @ApiQuery({ name: "operatorId", required: false, description: "Filter by operator ID (project creator)" })
  @ApiQuery({ name: "status", required: false, description: "Filter by project status" })
  @ApiOkResponse({ description: "Array of surveys for map" })
  async listForMap(
    @common.Query("bbox") bbox: string,
    @common.Query("months") months?: string,
    @common.Query("startDate") startDate?: string,
    @common.Query("endDate") endDate?: string,
    @common.Query("eiriMin") eiriMin?: string,
    @common.Query("eiriMax") eiriMax?: string,
    @common.Query("eiriRange") eiriRange?: string,
    @common.Query("operator") operator?: string,
    @common.Query("operatorId") operatorId?: string,
    @common.Query("status") status?: string
  ) {
    const parts = (bbox ?? "").split(",").map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return [];
    }
    // Normalize bbox so min/max are in correct order
    const minLng = Math.min(parts[0], parts[2]);
    const maxLng = Math.max(parts[0], parts[2]);
    const minLat = Math.min(parts[1], parts[3]);
    const maxLat = Math.max(parts[1], parts[3]);


    // Parse all filters
    const parsedStartDate = parseDate(startDate);
    const parsedEndDate = parseDate(endDate, true);
    const range = extractEiriRange(eiriRange);
    const parsedEiriMin = parseNumber(eiriMin) ?? range.min;
    const parsedEiriMax = parseNumber(eiriMax) ?? range.max;
    const parsedOperator = getString(operator) ?? getString(operatorId);
    const parsedStatus = parseStatus(status);

    // Build where clause with all filters
    const where: any = {};
    
    // Date filters on survey startTime
    if (parsedStartDate || parsedEndDate) {
      where.startTime = {};
      if (parsedStartDate) {
        where.startTime.gte = parsedStartDate;
      }
      if (parsedEndDate) {
        where.startTime.lte = parsedEndDate;
      }
    } else {
      // Fallback to months lookback if no date filters provided
      const lookbackMonths = Number.isFinite(Number(months)) ? Number(months) : 6;
      const since = new Date();
      since.setMonth(since.getMonth() - lookbackMonths);
      where.createdAt = { gte: since };
    }

    // eIRI filters on survey eIriAvg
    if (parsedEiriMin !== undefined || parsedEiriMax !== undefined) {
      where.eIriAvg = {};
      if (parsedEiriMin !== undefined) {
        where.eIriAvg.gte = parsedEiriMin;
      }
      if (parsedEiriMax !== undefined) {
        where.eIriAvg.lte = parsedEiriMax;
      }
    }

    // Operator and status filters on project
    if (parsedOperator || parsedStatus) {
      where.project = {};
      if (parsedOperator) {
        where.project.createdBy = parsedOperator;
      }
      if (parsedStatus) {
        where.project.status = parsedStatus;
      }
    }

    // Fetch surveys with all filters; filter bbox in memory for reliability
    const surveys = await this.service.surveys({
      where,
      select: {
        id: true,
        projectId: true,
        name: true,
        status: true,
        createdAt: true,
        startTime: true,
        endTime: true,
        eIriAvg: true,
        lengthMeters: true,
        geometryJson: true,
        bbox: true,
      } as any,
      orderBy: { createdAt: "desc" },
    });

    const overlaps = (b?: any): boolean => {
      if (!Array.isArray(b) || b.length < 4) return false;
      const [sMinLng, sMinLat, sMaxLng, sMaxLat] = b.map((n: any) => Number(n));
      if ([sMinLng, sMinLat, sMaxLng, sMaxLat].some((n) => !Number.isFinite(n))) return false;
      // rectangles overlap test
      const lonOverlap = sMinLng <= maxLng && sMaxLng >= minLng;
      const latOverlap = sMinLat <= maxLat && sMaxLat >= minLat;
      return lonOverlap && latOverlap;
    };

    return surveys
      .filter((s: any) => overlaps(s.bbox))
      .map((s: any) => ({
        id: s.id,
        projectId: s.projectId,
        name: s.name,
        status: s.status,
        startTime: s.startTime,
        endTime: s.endTime,
        lengthMeters: s.lengthMeters,
        eIriAvg: s.eIriAvg,
        color: bucketColor(s.eIriAvg),
        geometry: s.geometryJson,
      }));
  }

  @common.Get("edge-analytics/:edgeId")
  @ApiOperation({ summary: "Get road-level analytics for a given edgeId" })
  @ApiQuery({
    name: "from",
    required: false,
    description: "Start date (ISO string). If omitted, no lower bound.",
  })
  @ApiQuery({
    name: "to",
    required: false,
    description: "End date (ISO string). If omitted, no upper bound.",
  })
  @ApiOkResponse({ description: "Road analytics for the requested edgeId" })
  async edgeAnalytics(
    @common.Req() req: Request,
    @common.Param("edgeId") edgeId: string,
    @common.Query("from") from?: string,
    @common.Query("to") to?: string,
    @common.Query("excludeSurveyIds") excludeSurveyIdsRaw?: string,
    @common.Query("excludeAnomalyIds") excludeAnomalyIdsRaw?: string
  ) {
    if (!edgeId) {
      throw new common.BadRequestException("edgeId is required");
    }

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if ((from && Number.isNaN(fromDate!.getTime())) || (to && Number.isNaN(toDate!.getTime()))) {
      throw new common.BadRequestException("Invalid from/to date");
    }

    const authUser = (req as any).user as { id: string; roles: string[] } | undefined;

    // Parse comma-separated exclusion lists (ids user has deselected in UI)
    const excludedSurveyIds = (excludeSurveyIdsRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const excludedAnomalyIds = (excludeAnomalyIdsRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Base filters (used for returning full lists)
    const surveyWhereBase: any = {
      edgeIds: { has: edgeId },
    };
    const hazardWhereBase: any = {
      edgeId,
    };

    // Date filters on survey.startTime and hazard.createdAt
    if (fromDate || toDate) {
      surveyWhereBase.startTime = {};
      hazardWhereBase.createdAt = {};
      if (fromDate) {
        surveyWhereBase.startTime.gte = fromDate;
        hazardWhereBase.createdAt.gte = fromDate;
      }
      if (toDate) {
        surveyWhereBase.startTime.lte = toDate;
        hazardWhereBase.createdAt.lte = toDate;
      }
    }

    // Entity scoping for non-admins (restrict to user's cityHall)
    let scopedCityHallId: string | null = null;
    if (authUser?.id && !authUser.roles?.includes("admin")) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: authUser.id },
        select: { cityHallId: true },
      });
      if (dbUser?.cityHallId) {
        scopedCityHallId = dbUser.cityHallId;
        surveyWhereBase.project = {
          ...(surveyWhereBase.project || {}),
          cityHallId: dbUser.cityHallId,
        };
        hazardWhereBase.project = {
          ...(hazardWhereBase.project || {}),
          cityHallId: dbUser.cityHallId,
        };
      }
    }

    // When surveys are excluded, get their projectIds to exclude from history
    let excludedProjectIds: string[] = [];
    if (excludedSurveyIds.length > 0) {
      const excludedSurveys = await this.prisma.survey.findMany({
        where: {
          id: { in: excludedSurveyIds },
        },
        select: {
          projectId: true,
        },
      });

      excludedProjectIds = excludedSurveys
        .map((s) => s.projectId)
        .filter((id): id is string => id !== null && id !== undefined);
    }

    // OPTIMIZED: Use RoadRatingHistory as primary source instead of Survey table
    // Build where clause for RoadRatingHistory
    const historyWhere: any = {
      roadId: edgeId,
    };

    if (scopedCityHallId) {
      historyWhere.entityId = scopedCityHallId;
    }

    if (fromDate || toDate) {
      historyWhere.createdAt = {};
      if (fromDate) {
        historyWhere.createdAt.gte = fromDate;
      }
      if (toDate) {
        historyWhere.createdAt.lte = toDate;
      }
    }

    if (excludedSurveyIds.length > 0) {
      historyWhere.surveyId = {
        notIn: excludedSurveyIds,
      };
    }

    // OPTIMIZED: Get RoadRatingHistory entries without nested includes (much faster)
    // Nested includes with survey->project are very slow. Fetch data separately instead.
    const transactionResult = await this.prisma.$transaction([
      this.prisma.roadRatingHistory.findMany({
        where: historyWhere,
        select: {
          id: true,
          roadId: true,
          eiri: true,
          userId: true,
          surveyId: true,
          projectId: true,
          anomaliesCount: true,
          createdAt: true,
        } as any,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.roadRatingHistory.aggregate({
        where: historyWhere,
        _avg: { eiri: true },
      }),
    ]);
    const historyEntries = transactionResult[0] as any[];
    const avgResult = transactionResult[1];

    // Get unique projectIds from history entries that have projectId
    const projectIdsFromHistory = Array.from(
      new Set((historyEntries as any[]).map((h: any) => h.projectId).filter((id: any): id is string => id !== null))
    );

    // Fetch projects and surveys in parallel (only for entries that have IDs)
    const [projects, surveys] = await Promise.all([
      projectIdsFromHistory.length > 0
        ? this.prisma.project.findMany({
            where: { id: { in: projectIdsFromHistory } },
            select: {
              id: true,
              name: true,
              createdBy: true,
              description: true,
              cityHallId: true,
            },
          })
        : Promise.resolve([]),
      (historyEntries as any[])
        .map((h: any) => h.surveyId)
        .filter((id: any): id is string => id !== null).length > 0
        ? this.prisma.survey.findMany({
            where: {
              id: {
                in: (historyEntries as any[])
                  .map((h: any) => h.surveyId)
                  .filter((id: any): id is string => id !== null),
              },
            },
            select: {
              id: true,
              name: true,
              status: true,
              startTime: true,
              endTime: true,
              eIriAvg: true,
              projectId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    // Create lookup maps
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const surveyById = new Map(surveys.map((s) => [s.id, s]));

    // Calculate totals from history entries - only count entries with valid survey data
    // This ensures totalSurveys matches what users can actually see in recentSurveys
    const validHistoryEntries = (historyEntries as any[]).filter(
      (h: any) => h.surveyId && surveyById.has(h.surveyId)
    );
    const totalSurveys = validHistoryEntries.length;
    const averageEiri = avgResult._avg.eiri ?? null;

    // Get unique users (project creators) from projects
    const uniqueCreatorIds = new Set(
      projects.map((p) => p.createdBy).filter((id): id is string => id !== null && id !== undefined)
    );
    const uniqueUsers = uniqueCreatorIds.size;

    // Resolve creator IDs to human-readable names
    const creatorIds = Array.from(uniqueCreatorIds);
    const creators =
      creatorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: creatorIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          })
        : [];

    const creatorNameById = new Map<string, string>();
    for (const u of creators) {
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
      creatorNameById.set(u.id, fullName || u.username || u.id);
    }

    // Handle excluded anomalies - get their projectIds
    if (excludedAnomalyIds.length > 0) {
      const excludedHazards = await this.prisma.hazard.findMany({
        where: { id: { in: excludedAnomalyIds } },
        select: { projectId: true },
      });
      const excludedHazardProjectIds = excludedHazards
        .map((h) => h.projectId)
        .filter((id): id is string => id !== null && id !== undefined);
      excludedProjectIds = [...excludedProjectIds, ...excludedHazardProjectIds];
    }

    // Filter history entries based on excluded project IDs
    // Use validHistoryEntries to ensure we only work with entries that have valid survey data
    let filteredHistory = validHistoryEntries;
    if (excludedProjectIds.length > 0) {
      filteredHistory = validHistoryEntries.filter(
        (h: any) => !h.projectId || !excludedProjectIds.includes(h.projectId)
      );
    }

    // Calculate total anomalies from denormalized anomaliesCount field
    const totalAnomalies = filteredHistory.reduce(
      (sum: number, h: any) => sum + (h.anomaliesCount ?? 0),
      0
    );

    // Get projectIds from filtered history for anomaly queries
    const projectIds = Array.from(
      new Set(filteredHistory.map((h: any) => h.projectId).filter((id: any): id is string => id !== null))
    );

    // Get recent surveys from history (limit 20)
    // Only include entries that have valid survey data to maintain data integrity
    const recentSurveysWithCreator = filteredHistory
      .filter((h: any) => h.surveyId && surveyById.has(h.surveyId)) // Only include entries with valid survey
      .slice(0, 20)
      .map((h: any) => {
        const project = h.projectId ? projectById.get(h.projectId) : null;
        const survey = surveyById.get(h.surveyId);
        const creatorId = project?.createdBy as string | undefined;
        const projectId = h.projectId ?? null;
        return {
          id: survey?.id ?? null,
          projectId: projectId,
          name: survey?.name ?? null,
          status: survey?.status ?? null,
          startTime: survey?.startTime ?? null,
          endTime: survey?.endTime ?? null,
          eIriAvg: h.eiri,
          createdBy: creatorId ?? null,
          createdByName: creatorId ? creatorNameById.get(creatorId) ?? null : null,
          projectDescription: project?.description ?? null,
          anomalyCount: h.anomaliesCount ?? 0,
        };
      });

    // Get recent anomalies (still need to query hazards for full details)
    const hazardWhere: any = {
      edgeId,
      projectId: projectIds.length > 0 ? { in: projectIds } : { in: [] },
    };

    if (excludedAnomalyIds.length > 0) {
      hazardWhere.id = { notIn: excludedAnomalyIds };
    }

    if (excludedProjectIds.length > 0) {
      hazardWhere.projectId = {
        ...hazardWhere.projectId,
        notIn: excludedProjectIds,
      };
    }

    if (fromDate || toDate) {
      hazardWhere.createdAt = {};
      if (fromDate) {
        hazardWhere.createdAt.gte = fromDate;
      }
      if (toDate) {
        hazardWhere.createdAt.lte = toDate;
      }
    }

    if (scopedCityHallId) {
      hazardWhere.project = {
        cityHallId: scopedCityHallId,
      };
    }

    const recentAnomaliesRaw = await this.prisma.hazard.findMany({
      where: hazardWhere,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        project: {
          select: {
            name: true,
          },
        },
      },
    });

    // Map recentAnomalies to include projectName and anomalyName
    const recentAnomaliesWithNames = recentAnomaliesRaw.map((anomaly: any, index: number) => {
      const { project, ...anomalyWithoutProject } = anomaly;
      return {
        ...anomalyWithoutProject,
        projectName: project?.name ?? null,
        anomalyName: anomaly.name ?? null,
        index: index + 1, // 1-based index for display (e.g., 1, 2, 3)
      };
    });

    // Calculate daily EIRI data using history entries (optimized)
    const dailyEiriData = this.calculateDailyEiriDataFromHistory(
      filteredHistory,
      fromDate,
      toDate
    );

    return {
      edgeId,
      from: fromDate ?? null,
      to: toDate ?? null,
      totalSurveys,
      totalAnomalies,
      uniqueUsers,
      averageEiri,
      recentSurveys: recentSurveysWithCreator,
      recentAnomalies: recentAnomaliesWithNames,
      dailyEiriData,
    };
  }

  // OPTIMIZED: Calculate daily EIRI from history entries instead of querying Survey table
  private calculateDailyEiriDataFromHistory(
    historyEntries: any[],
    fromDate: Date | undefined,
    toDate: Date | undefined
  ): Array<{
    date: string;
    day: string;
    dayNumber: number;
    month: string;
    value: number | null;
  }> {
    // Determine the end date (use toDate if provided, otherwise use today)
    const endDate = toDate ? new Date(toDate) : new Date();
    endDate.setHours(23, 59, 59, 999); // End of day

    // Calculate start date (6 days before end date for 7 days total)
    let startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0); // Start of day

    if (fromDate) {
      const fromDateNormalized = new Date(fromDate);
      fromDateNormalized.setHours(0, 0, 0, 0);
      if (fromDateNormalized > startDate) {
        startDate = fromDateNormalized;
      }
    }

    // Group history entries by date (YYYY-MM-DD)
    const eiriByDate = new Map<string, number[]>();
    for (const h of historyEntries) {
      if (!h.createdAt) continue;
      const date = new Date(h.createdAt);
      if (date < startDate || date > endDate) continue;
      
      const dateKey = date.toISOString().split("T")[0];
      if (!eiriByDate.has(dateKey)) {
        eiriByDate.set(dateKey, []);
      }
      eiriByDate.get(dateKey)!.push(h.eiri);
    }

    // Generate array for last 7 days
    const dailyData: Array<{
      date: string;
      day: string;
      dayNumber: number;
      month: string;
      value: number | null;
    }> = [];

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      
      const dateKey = currentDate.toISOString().split("T")[0];
      const dayOfWeek = currentDate.getDay();
      const dayNumber = currentDate.getDate();
      const monthIndex = currentDate.getMonth();

      // Calculate average EIRI for this day if history entries exist
      let value: number | null = null;
      const dayEiris = eiriByDate.get(dateKey);
      if (dayEiris && dayEiris.length > 0) {
        const sum = dayEiris.reduce((a: number, b: number) => a + b, 0);
        value = Math.round((sum / dayEiris.length) * 100) / 100; // Round to 2 decimal places
      }

      dailyData.push({
        date: dateKey,
        day: dayNames[dayOfWeek],
        dayNumber,
        month: monthNames[monthIndex],
        value,
      });
    }

    return dailyData;
  }
}

function bucketColor(value?: number | null): string {
  if (value == null) return "gray";
  if (value < 1) return "red";
  if (value < 2) return "orange";
  if (value < 3) return "light_orange";
  if (value < 4) return "light_green";
  return "green";
}
