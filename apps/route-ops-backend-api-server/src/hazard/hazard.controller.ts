import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { HazardService } from "./hazard.service";
import { HazardControllerBase } from "./base/hazard.controller.base";
import { AddRemarkToHazardDto } from "./dto/AddRemarkToHazardDto";
import { Remark } from "../remark/base/Remark";
import { UserData } from "../auth/userData.decorator";
import { UserInfo } from "../auth/UserInfo";

@swagger.ApiTags("hazards")
@common.Controller("hazards")
export class HazardController extends HazardControllerBase {
  constructor(
    protected readonly service: HazardService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  @common.Post(":id/remarks")
  @swagger.ApiOperation({ 
    summary: "Add a remark to a hazard",
    description: "Creates a remark for a hazard. If the user doesn't have an active survey for the project, a new survey will be created automatically."
  })
  @swagger.ApiCreatedResponse({ 
    type: Remark,
    description: "The remark has been successfully created and linked to the hazard."
  })
  @swagger.ApiBadRequestResponse({ 
    description: "Invalid input data or hazard not found."
  })
  @swagger.ApiForbiddenResponse({ 
    description: "Insufficient permissions."
  })
  @nestAccessControl.UseRoles({
    resource: "Remark",
    action: "create",
    possession: "any",
  })
  async addRemarkToHazard(
    @common.Param("id") hazardId: string,
    @common.Body() remarkData: AddRemarkToHazardDto,
    @UserData() userInfo: UserInfo
  ): Promise<Remark> {
    return await this.service.addRemarkToHazard(hazardId, userInfo.id, remarkData);
  }

  @common.Get(":id/remarks")
  @swagger.ApiOperation({ 
    summary: "Get all remarks for a hazard",
    description: "Retrieves all remarks associated with a specific hazard, ordered by creation date (newest first)."
  })
  @swagger.ApiOkResponse({ 
    type: [Remark],
    description: "List of remarks for the hazard."
  })
  @swagger.ApiNotFoundResponse({ 
    description: "Hazard not found."
  })
  @swagger.ApiForbiddenResponse({ 
    description: "Insufficient permissions."
  })
  @nestAccessControl.UseRoles({
    resource: "Remark",
    action: "read",
    possession: "any",
  })
  async getHazardRemarks(
    @common.Param("id") hazardId: string
  ): Promise<Remark[]> {
    return await this.service.getHazardRemarks(hazardId);
  }
}