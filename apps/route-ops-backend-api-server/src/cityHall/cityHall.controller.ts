import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { CityHallService } from "./cityHall.service";
import { CityHallControllerBase } from "./base/cityHall.controller.base";
import { CityHall } from "./base/CityHall";

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

  /**
   * Get available city halls for dropdown (Admin only)
   */
  @common.Get("available")
  @swagger.ApiOperation({ 
    summary: "Get available city halls for dropdown",
    description: "Returns all city halls available for user assignment (Admin only)"
  })
  @swagger.ApiOkResponse({ 
    type: [CityHall],
    description: "List of available city halls"
  })
  @swagger.ApiForbiddenResponse({ 
    description: "Insufficient permissions"
  })
  @nestAccessControl.UseRoles({
    resource: "CityHall",
    action: "read",
    possession: "any",
  })
  async getAvailableCityHalls(): Promise<CityHall[]> {
    return this.service.cityHalls({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }
}
