import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { CityHallService } from "./cityHall.service";
import { CityHallControllerBase } from "./base/cityHall.controller.base";
import { CityHall } from "./base/CityHall";
import { UserData } from "../auth/userData.decorator";
import { UserInfo } from "../auth/UserInfo";
import { PrismaService } from "../prisma/prisma.service";

@swagger.ApiTags("cityHalls")
@common.Controller("cityHalls")
export class CityHallController extends CityHallControllerBase {
  constructor(
    protected readonly service: CityHallService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder,
    private readonly prisma: PrismaService
  ) {
    super(service, rolesBuilder);
  }

  /**
   * Get available city halls for dropdown (Admin only)
   */
  @common.Get("available")
  @swagger.ApiOperation({ 
    summary: "Get available city halls for dropdown",
    description: "Returns available city halls. Admin sees all; dashboard users see their own; app users forbidden."
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
  async getAvailableCityHalls(@UserData() userInfo: UserInfo): Promise<CityHall[]> {
    if (userInfo.roles.includes("admin")) {
      return this.service.cityHalls({
        select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
        orderBy: { name: 'asc' },
      });
    }
    if (userInfo.roles.includes("dashboard_user")) {
      const me = await this.prisma.user.findUnique({ where: { id: userInfo.id }, select: { cityHallId: true } });
      if (!me?.cityHallId) return [];
      return this.service.cityHalls({
        where: { id: me.cityHallId },
        select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
        orderBy: { name: 'asc' },
      });
    }
    throw new common.ForbiddenException("Insufficient permissions");
  }
}
