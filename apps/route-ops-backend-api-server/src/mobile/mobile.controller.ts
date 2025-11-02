import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { MobileService } from "./mobile.service";
import { UserData } from "../auth/userData.decorator";
import { UserInfo } from "../auth/UserInfo";
import { StartProjectDto } from "./dto/StartProjectDto";
import { EndProjectDto } from "./dto/EndProjectDto";
import { UploadAttachmentsDto } from "./dto/UploadAttachmentsDto";
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
  @swagger.ApiParam({ name: "id", type: "string", example: "550e8400-e29b-41d4-a716-446655440000" })
  @swagger.ApiOkResponse({
    description: "Entity details",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
        name: { type: "string", example: "City Hall" },
        description: { type: "string", nullable: true, example: "Main city hall" },
        supportedAreaVersion: { type: "string", nullable: true, example: null },
        features: { type: "array", items: { type: "string" }, example: [] },
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
}


