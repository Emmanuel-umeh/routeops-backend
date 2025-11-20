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

@swagger.ApiTags("surveys")
@common.Controller("surveys")
export class SurveyController extends SurveyControllerBase {
  constructor(
    protected readonly service: SurveyService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
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
}

function bucketColor(value?: number | null): string {
  if (value == null) return "gray";
  if (value < 1) return "red";
  if (value < 2) return "orange";
  if (value < 3) return "light_orange";
  if (value < 4) return "light_green";
  return "green";
}
