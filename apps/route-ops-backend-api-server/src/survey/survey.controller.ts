import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { SurveyService } from "./survey.service";
import { SurveyControllerBase } from "./base/survey.controller.base";
import { ApiOkResponse, ApiOperation, ApiQuery } from "@nestjs/swagger";

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
  @ApiOkResponse({ description: "Array of surveys for map" })
  async listForMap(@common.Query("bbox") bbox: string, @common.Query("months") months?: string) {
    const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number);
    const lookbackMonths = Number(months ?? 6);

    const since = new Date();
    since.setMonth(since.getMonth() - lookbackMonths);

    // Filter by createdAt and bbox overlap; bbox is stored as [minLng,minLat,maxLng,maxLat]
    const surveys = await this.service.surveys({
      where: {
        createdAt: { gte: since },
        OR: [
          { bbox: { path: [], array_contains: [minLng, minLat, maxLng, maxLat] as any } },
        ],
      } as any,
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
      },
      orderBy: { createdAt: "desc" },
    });

    return surveys.map((s: any) => ({
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
