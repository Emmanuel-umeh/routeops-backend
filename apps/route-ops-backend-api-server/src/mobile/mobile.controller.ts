import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { MobileService } from "./mobile.service";
import { UserData } from "../auth/userData.decorator";
import { UserInfo } from "../auth/UserInfo";
import { StartProjectDto } from "./dto/StartProjectDto";
import { EndProjectDto } from "./dto/EndProjectDto";
import { UploadAttachmentsDto } from "./dto/UploadAttachmentsDto";

@swagger.ApiTags("mobile")
@common.Controller("mobile")
export class MobileController {
  constructor(private readonly service: MobileService) {}

  @common.Get("user")
  @swagger.ApiOperation({ summary: "Get current mobile user profile" })
  async getUser(@UserData() user: UserInfo) {
    return this.service.getMobileUser(user);
  }

  @common.Get("entity/:id")
  @swagger.ApiOperation({ summary: "Get entity details for mobile" })
  async getEntity(@common.Param("id") id: string) {
    return this.service.getEntity(id);
  }

  @common.Get("entity/supported-area/:version")
  @swagger.ApiOperation({ summary: "Get supported area GIS by version" })
  async getSupportedArea(
    @common.Param("version") version: string,
    @common.Query("entityId") entityId?: string
  ) {
    return this.service.getSupportedArea(entityId, version);
  }

  @common.Post("project/start")
  @swagger.ApiOperation({ summary: "Start project from mobile" })
  async startProject(@common.Body() body: StartProjectDto, @UserData() user: UserInfo) {
    return this.service.startProject(body, user);
  }

  @common.Post("project/end")
  @swagger.ApiOperation({ summary: "End project from mobile" })
  async endProject(@common.Body() body: EndProjectDto, @UserData() user: UserInfo) {
    return this.service.endProject(body, user);
  }

  @common.Post("attachments")
  @swagger.ApiOperation({ summary: "Upload attachments for a project" })
  async uploadAttachments(@common.Body() body: UploadAttachmentsDto) {
    return this.service.uploadAttachments(body);
  }

  @common.Get("project/:id/status")
  @swagger.ApiOperation({ summary: "Get project sync status for mobile" })
  async getProjectStatus(@common.Param("id") id: string) {
    return this.service.getProjectStatus(id);
  }
}


