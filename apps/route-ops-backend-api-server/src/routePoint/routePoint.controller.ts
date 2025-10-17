import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { RoutePointService } from "./routePoint.service";
import { RoutePointControllerBase } from "./base/routePoint.controller.base";

@swagger.ApiTags("routePoints")
@common.Controller("routePoints")
export class RoutePointController extends RoutePointControllerBase {
  constructor(
    protected readonly service: RoutePointService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
