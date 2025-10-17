import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { CityHallService } from "./cityHall.service";
import { CityHallControllerBase } from "./base/cityHall.controller.base";

@swagger.ApiTags("cityHalls")
@common.Controller("cityHalls")
export class CityHallController extends CityHallControllerBase {
  constructor(
    protected readonly service: CityHallService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
