import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { HazardService } from "./hazard.service";
import { HazardControllerBase } from "./base/hazard.controller.base";

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
}
