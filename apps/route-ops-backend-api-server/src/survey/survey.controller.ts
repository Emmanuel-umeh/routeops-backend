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

    // Clone base filters for aggregates and apply exclusions only there
    const surveyWhere: any = { ...surveyWhereBase };
    const hazardWhere: any = { ...hazardWhereBase };

    if (excludedSurveyIds.length > 0) {
      surveyWhere.id = {
        ...(surveyWhere.id || {}),
        notIn: excludedSurveyIds,
      };
    }

    if (excludedAnomalyIds.length > 0) {
      hazardWhere.id = {
        ...(hazardWhere.id || {}),
        notIn: excludedAnomalyIds,
      };
    }

    const [totalSurveys, totalAnomalies, recentSurveys, recentAnomalies, avg] =
      await this.prisma.$transaction([
        this.prisma.survey.count({ where: surveyWhere }),
        this.prisma.hazard.count({ where: hazardWhere }),
        this.prisma.survey.findMany({
          where: surveyWhereBase,
          orderBy: { startTime: "desc" },
          take: 20,
          select: {
            id: true,
            projectId: true,
            name: true,
            status: true,
            startTime: true,
            endTime: true,
            eIriAvg: true,
            project: {
              select: {
                createdBy: true,
              },
            },
          } as any,
        }),
        this.prisma.hazard.findMany({
          where: hazardWhereBase,
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            projectId: true,
            name: true,
            imageUrl: true,
            latitude: true,
            longitude: true,
            severity: true,
            typeField: true,
            createdAt: true,
            project: {
              select: {
                name: true,
              },
            },
          } as any,
        }),
        this.prisma.survey.aggregate({
          where: {
            ...surveyWhere,
            eIriAvg: { not: null },
          },
          _avg: { eIriAvg: true },
        }),
      ]);

    // Unique users who created projects for these edge surveys
    const uniqueUserResult = await this.prisma.$queryRawUnsafe<{ count: string }[]>(
      `
      SELECT COUNT(DISTINCT "Project"."createdBy")::text AS count
      FROM "Survey"
      JOIN "Project" ON "Survey"."projectId" = "Project"."id"
      WHERE $1 = ANY("Survey"."edgeIds")
        AND ($2::timestamptz IS NULL OR "Survey"."startTime" >= $2)
        AND ($3::timestamptz IS NULL OR "Survey"."startTime" <= $3)
        AND ($4::text[] IS NULL OR NOT ("Survey"."id" = ANY($4::text[])))
        AND ($5::text IS NULL OR "Project"."cityHallId" = $5::text)
    `,
      edgeId,
      fromDate ?? null,
      toDate ?? null,
      excludedSurveyIds.length > 0 ? excludedSurveyIds : null,
      scopedCityHallId
    );

    const uniqueUsers = Number(uniqueUserResult?.[0]?.count ?? 0);

    // Resolve creator IDs to human-readable names
    const creatorIds = Array.from(
      new Set(
        recentSurveys
          .map((s: any) => s.project?.createdBy)
          .filter((id: string | null | undefined) => !!id)
      )
    ) as string[];

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

    // Map recentSurveys to include the display name of the user who created the project (survey creator)
    const recentSurveysWithCreator = recentSurveys.map((survey: any) => {
      const { project, ...surveyWithoutProject } = survey;
      const creatorId = project?.createdBy as string | undefined;
      return {
        ...surveyWithoutProject,
        createdBy: creatorId ?? null,
        createdByName: creatorId ? creatorNameById.get(creatorId) ?? null : null,
      };
    });

    // Map recentAnomalies to include projectName and anomalyName
    const recentAnomaliesWithNames = recentAnomalies.map((anomaly: any, index: number) => {
      const { project, ...anomalyWithoutProject } = anomaly;
      return {
        ...anomalyWithoutProject,
        projectName: project?.name ?? null,
        anomalyName: anomaly.name ?? null,
        index: index + 1, // 1-based index for display (e.g., 1, 2, 3)
      };
    });

    return {
      edgeId,
      from: fromDate ?? null,
      to: toDate ?? null,
      totalSurveys,
      totalAnomalies,
      uniqueUsers,
      averageEiri: avg._avg.eIriAvg ?? null,
      recentSurveys: recentSurveysWithCreator,
      recentAnomalies: recentAnomaliesWithNames,
    };
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
