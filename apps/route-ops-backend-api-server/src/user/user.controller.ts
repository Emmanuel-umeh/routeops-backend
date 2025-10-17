import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { UserService } from "./user.service";
import { UserControllerBase } from "./base/user.controller.base";
import { UserData } from "../auth/userData.decorator";
import { UserInfo } from "../auth/UserInfo";
import { UserCreateInput } from "./base/UserCreateInput";

@swagger.ApiTags("users")
@common.Controller("users")
export class UserController extends UserControllerBase {
  constructor(
    protected readonly service: UserService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  /**
   * Get dashboard users (Admin only)
   */
  @common.Get("dashboard-users")
  @swagger.ApiOkResponse({ type: [Object] })
  @nestAccessControl.UseRoles({
    resource: "User",
    action: "read",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: common.ForbiddenException,
  })
  async getDashboardUsers(@UserData() userInfo: UserInfo) {
    // Only admin can access this endpoint
    if (!userInfo.roles.includes("admin")) {
      throw new common.ForbiddenException("Only admin can view dashboard users");
    }
    
    return this.service.getDashboardUsers();
  }

  /**
   * Get app users (Admin can see all, Dashboard User can see only their city hall)
   */
  @common.Get("app-users")
  @swagger.ApiOkResponse({ type: [Object] })
  @nestAccessControl.UseRoles({
    resource: "User",
    action: "read",
    possession: "own",
  })
  @swagger.ApiForbiddenResponse({
    type: common.ForbiddenException,
  })
  async getAppUsers(
    @UserData() userInfo: UserInfo,
    @common.Query("cityHallId") cityHallId?: string
  ) {
    // Get current user's city hall
    const currentUser = await this.service.user({
      where: { id: userInfo.id },
      include: { cityHall: true },
    });

    if (userInfo.roles.includes("admin")) {
      // Admin can see all app users or filter by city hall
      return this.service.getAppUsers(cityHallId);
    } else if (userInfo.roles.includes("dashboard_user")) {
      // Dashboard users can only see app users from their city hall
      if (currentUser?.cityHallId) {
        return this.service.getAppUsers(currentUser.cityHallId);
      }
      return [];
    } else {
      throw new common.ForbiddenException("Insufficient permissions");
    }
  }

  /**
   * Create user with role-based validation
   */
  @common.Post("create-with-role")
  @swagger.ApiCreatedResponse({ type: Object })
  @nestAccessControl.UseRoles({
    resource: "User",
    action: "create",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: common.ForbiddenException,
  })
  async createUserWithRoleValidation(
    @common.Body() data: UserCreateInput,
    @UserData() userInfo: UserInfo
  ) {
    // Get current user's city hall
    const currentUser = await this.service.user({
      where: { id: userInfo.id },
      include: { cityHall: true },
    });

    const userRole = currentUser?.role || "app_user";
    const userCityHallId = currentUser?.cityHallId;

    try {
      return await this.service.createUserWithRoleValidation(
        {
          ...data,
          cityHall: data.cityHall
            ? {
                connect: data.cityHall,
              }
            : undefined,
        },
        userRole,
        userCityHallId || undefined
      );
    } catch (error) {
      throw new common.BadRequestException((error as Error).message);
    }
  }

  /**
   * Get users by city hall (Admin and Dashboard User)
   */
  @common.Get("by-city-hall/:cityHallId")
  @swagger.ApiOkResponse({ type: [Object] })
  @nestAccessControl.UseRoles({
    resource: "User",
    action: "read",
    possession: "own",
  })
  @swagger.ApiForbiddenResponse({
    type: common.ForbiddenException,
  })
  async getUsersByCityHall(
    @common.Param("cityHallId") cityHallId: string,
    @UserData() userInfo: UserInfo
  ) {
    // Get current user's city hall
    const currentUser = await this.service.user({
      where: { id: userInfo.id },
      include: { cityHall: true },
    });

    if (userInfo.roles.includes("admin")) {
      // Admin can see users from any city hall
      return this.service.getUsersByCityHall(cityHallId);
    } else if (userInfo.roles.includes("dashboard_user")) {
      // Dashboard users can only see users from their own city hall
      if (currentUser?.cityHallId === cityHallId) {
        return this.service.getUsersByCityHall(cityHallId);
      } else {
        throw new common.ForbiddenException("Can only view users from your assigned city hall");
      }
    } else {
      throw new common.ForbiddenException("Insufficient permissions");
    }
  }

  /**
   * Get filtered users based on role and permissions
   */
  @common.Get("filtered")
  @swagger.ApiOkResponse({ type: [Object] })
  @nestAccessControl.UseRoles({
    resource: "User",
    action: "read",
    possession: "own",
  })
  @swagger.ApiForbiddenResponse({
    type: common.ForbiddenException,
  })
  async getFilteredUsers(
    @UserData() userInfo: UserInfo,
    @common.Query("role") role?: string,
    @common.Query("cityHallId") cityHallId?: string
  ) {
    // Get current user's city hall
    const currentUser = await this.service.user({
      where: { id: userInfo.id },
      include: { cityHall: true },
    });

    const userRole = currentUser?.role || "app_user";
    const userCityHallId = currentUser?.cityHallId;

    return this.service.getUsersByRoleAndCityHall(
      userInfo.id,
      userRole,
      userCityHallId || undefined,
      role,
      cityHallId
    );
  }
}
