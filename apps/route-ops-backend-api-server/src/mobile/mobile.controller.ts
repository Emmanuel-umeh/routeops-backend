import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { MobileService } from "./mobile.service";
import { UserData } from "../auth/userData.decorator";
import { UserInfo } from "../auth/UserInfo";
import { StartProjectDto } from "./dto/StartProjectDto";
import { EndProjectDto } from "./dto/EndProjectDto";
import { UploadAttachmentsDto } from "./dto/UploadAttachmentsDto";
import { UpdateAnomalyAttachmentsDto } from "./dto/UpdateAnomalyAttachmentsDto";
import * as defaultAuthGuard from "../auth/defaultAuth.guard";

@swagger.ApiTags("mobile")
@swagger.ApiBearerAuth()
@common.UseGuards(defaultAuthGuard.DefaultAuthGuard)
@common.Controller("mobile")
export class MobileController {
  constructor(private readonly service: MobileService) {}

  @common.Get("user")
  @swagger.ApiOperation({ summary: "Get current mobile user profile" })
  @swagger.ApiOkResponse({
    description: "Current user profile",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
        username: { type: "string", example: "mobile_user" },
        roles: { type: "array", items: { type: "string" }, example: ["app_user"] },
        entityId: { type: "string", nullable: true, example: "550e8400-e29b-41d4-a716-446655440000" },
        features: { type: "array", items: { type: "string" }, example: [] },
      },
    },
  })
  async getUser(@UserData() user: UserInfo) {
    return this.service.getMobileUser(user);
  }

  @common.Get("entity/:id")
  @swagger.ApiOperation({ summary: "Get entity details for mobile" })
  @swagger.ApiParam({
    name: "id",
    type: "string",
    example: "c0299df3-3cab-463c-8ffa-ad95212ce564",
  })
  @swagger.ApiOkResponse({
    description: "Entity details",
    schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          example: "c0299df3-3cab-463c-8ffa-ad95212ce564",
        },
        name: { type: "string", example: "Infralobo" },
        description: {
          type: "string",
          nullable: true,
          example: "Pilot entity for first deployment",
        },
        gisFile: {
          type: "object",
          nullable: true,
          properties: {
            version: { type: "string", example: "1.0" },
            url: {
              type: "string",
              example:
                "https://firebasestorage.googleapis.com/v0/b/smartroads-gmaps-dev.firebasestorage.app/o/geopackages%2Ffaro.gpkg?alt=media&token=...",
            },
          },
        },
        defaultLocation: {
          type: "object",
          properties: {
            latitude: { type: "number", example: 37.060899 },
            longitude: { type: "number", example: -8.064873 },
          },
        },
        allowVideo: { type: "boolean", example: true },
        allowImages: { type: "boolean", example: true },
      },
    },
  })
  async getEntity(@common.Param("id") id: string) {
    return this.service.getEntity(id);
  }

  @common.Get("entity/supported-area/:version")
  @swagger.ApiOperation({ summary: "Get supported area GIS by version" })
  @swagger.ApiParam({ name: "version", type: "string", example: "v1.0" })
  @swagger.ApiQuery({ name: "entityId", required: false, type: "string", example: "550e8400-e29b-41d4-a716-446655440000" })
  @swagger.ApiOkResponse({
    description: "GeoJSON FeatureCollection of supported area",
    schema: {
      type: "object",
      properties: {
        type: { type: "string", example: "FeatureCollection" },
        features: { type: "array", items: { type: "object" }, example: [] },
        entityId: { type: "string", nullable: true, example: "550e8400-e29b-41d4-a716-446655440000" },
        version: { type: "string", example: "v1.0" },
      },
    },
  })
  async getSupportedArea(
    @common.Param("version") version: string,
    @common.Query("entityId") entityId?: string
  ) {
    return this.service.getSupportedArea(entityId, version);
  }

  @common.Post("project/start")
  @swagger.ApiOperation({ summary: "Start project from mobile" })
  @swagger.ApiBody({ type: StartProjectDto })
  @swagger.ApiOkResponse({
    description: "Project started successfully",
    schema: {
      type: "object",
      properties: {
        projectId: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
      },
    },
  })
  async startProject(@common.Body() body: StartProjectDto, @UserData() user: UserInfo) {
    return this.service.startProject(body, user);
  }

  @common.Post("project/start/:id")
  @swagger.ApiOperation({ summary: "Start existing scheduled project by id (upsert start data)" })
  @swagger.ApiParam({ name: "id", type: "string" })
  @swagger.ApiBody({ type: StartProjectDto })
  @swagger.ApiOkResponse({
    description: "Project started or updated successfully",
    schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
      },
    },
  })
  async startExistingProject(
    @common.Param("id") id: string,
    @common.Body() body: StartProjectDto,
    @UserData() user: UserInfo
  ) {
    return this.service.startExistingProject(id, body, user);
  }
  @common.Post("project/end")
  @swagger.ApiOperation({ summary: "End project from mobile" })
  @swagger.ApiBody({ type: EndProjectDto })
  @swagger.ApiOkResponse({
    description: "Project ended successfully",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        surveyId: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
      },
    },
  })
  async endProject(@common.Body() body: EndProjectDto, @UserData() user: UserInfo) {
    return this.service.endProject(body, user);
  }

  @common.Post("attachments")
  @swagger.ApiOperation({ summary: "Upload attachments for a project" })
  @swagger.ApiBody({ type: UploadAttachmentsDto })
  @swagger.ApiOkResponse({
    description: "Attachments uploaded successfully",
    schema: {
      type: "object",
      properties: {
        uploaded: { type: "number", example: 5 },
        remaining: { type: "number", example: 0 },
        complete: { type: "boolean", example: true },
        projectId: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
        type: { type: "string", enum: ["image", "video"], example: "image" },
      },
    },
  })
  async uploadAttachments(@common.Body() body: UploadAttachmentsDto) {
    return this.service.uploadAttachments(body);
  }

  @common.Get("project/:id/status")
  @swagger.ApiOperation({ summary: "Get project sync status for mobile" })
  @swagger.ApiParam({ name: "id", type: "string", example: "550e8400-e29b-41d4-a716-446655440000" })
  @swagger.ApiOkResponse({
    description: "Project sync status",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", nullable: true, example: "active" },
        attachmentsProgress: {
          type: "object",
          properties: {
            imagesUploaded: { type: "number", example: 0 },
            videosUploaded: { type: "number", example: 0 },
            imagesTotal: { type: "number", example: 0 },
            videosTotal: { type: "number", example: 0 },
            complete: { type: "boolean", example: true },
          },
        },
      },
    },
  })
  async getProjectStatus(@common.Param("id") id: string) {
    return this.service.getProjectStatus(id);
  }

  @common.Get("projects/scheduled")
  @swagger.ApiOperation({ summary: "List scheduled (future) projects for current user" })
  @swagger.ApiOkResponse({
    description: "Scheduled projects",
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          lat: { type: "number", nullable: true },
          lng: { type: "number", nullable: true },
          remarks: { type: "string", nullable: true },
          startDate: { type: "string", description: "ISO 8601 date" },
            name: { type: "string" },
        },
      },
    },
  })
  async listScheduled(@UserData() user: UserInfo) {
    return this.service.getScheduledProjects(user);
  }

  @common.Put("anomaly/attachments")
  @swagger.ApiOperation({ summary: "Update attachments for an anomaly by externalId" })
  @swagger.ApiBody({ type: UpdateAnomalyAttachmentsDto })
  @swagger.ApiOkResponse({
    description: "Anomaly attachments updated successfully",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        hazardId: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
        externalId: { type: "string", example: "mobile-anomaly-123" },
        imageUrl: { type: "string", example: "https://firebasestorage.googleapis.com/.../image.jpg" },
      },
    },
  })
  @swagger.ApiNotFoundResponse({
    description: "Hazard with the given externalId not found",
  })
  async updateAnomalyAttachments(@common.Body() body: UpdateAnomalyAttachmentsDto) {
    return this.service.updateAnomalyAttachments(body.externalId, body.files);
  }
}


