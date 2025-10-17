import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { RemarkService } from "./remark.service";
import { RemarkControllerBase } from "./base/remark.controller.base";

@swagger.ApiTags("remarks")
@common.Controller("remarks")
export class RemarkController extends RemarkControllerBase {
  constructor(
    protected readonly service: RemarkService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
