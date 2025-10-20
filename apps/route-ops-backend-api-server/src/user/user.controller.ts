import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { UserService } from "./user.service";
import { UserControllerBase } from "./base/user.controller.base";
import { UserData } from "../auth/userData.decorator";
import { UserInfo } from "../auth/UserInfo";
import { UserCreateInput } from "./base/UserCreateInput";
import { User } from "./base/User";
import { PrismaService } from "../prisma/prisma.service";

@swagger.ApiTags("users")
@common.Controller("users")
export class UserController extends UserControllerBase {
  constructor(
    protected readonly service: UserService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder,
    private readonly prisma: PrismaService
  ) {
    super(service, rolesBuilder);
  }

  /**
   * Get current user profile with city hall information
   */
  @common.Get("profile")
  @swagger.ApiOperation({
    summary: "Get current user profile",
    description: "Returns the current authenticated user's profile with city hall information"
  })
  @swagger.ApiOkResponse({
    type: User,
    description: "Current user profile with city hall info"
  })
  @swagger.ApiForbiddenResponse({
    description: "Insufficient permissions"
  })
  @nestAccessControl.UseRoles({
    resource: "User",
    action: "read",
    possession: "own",
  })
  async getCurrentUserProfile(@UserData() userInfo: UserInfo): Promise<User> {
    const user = await this.service.user({
      where: { id: userInfo.id },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        roles: true,
        isActive: true,
        cityHall: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new common.NotFoundException("User not found");
    }

    return user as User;
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

  /**
   * Get users by specific role (Admin only)
   */
  @common.Get("by-role/:role")
  @swagger.ApiOperation({
    summary: "Get users by role",
    description: "Get all users with a specific role (Admin only)"
  })
  @swagger.ApiOkResponse({
    type: [User],
    description: "List of users with the specified role"
  })
  @swagger.ApiForbiddenResponse({
    description: "Insufficient permissions - Admin only"
  })
  @nestAccessControl.UseRoles({
    resource: "User",
    action: "read",
    possession: "any",
  })
  async getUsersByRole(
    @common.Param("role") role: string,
    @UserData() userInfo: UserInfo
  ) {
    // Only admin can access this endpoint
    if (!userInfo.roles.includes("admin")) {
      throw new common.ForbiddenException("Only admin can view users by role");
    }

    const validRoles = ["admin", "dashboard_user", "app_user"];
    if (!validRoles.includes(role)) {
      throw new common.BadRequestException(`Invalid role. Must be one of: ${validRoles.join(", ")}`);
    }

    return this.service.getUsersByRoleAndCityHall(
      userInfo.id,
      "admin",
      undefined,
      role,
      undefined
    );
  }

  /**
   * Update user city hall assignment (Admin only)
   */
  @common.Patch(":id/city-hall")
  @swagger.ApiOperation({
    summary: "Update user city hall assignment",
    description: "Update a user's city hall assignment (Admin only)"
  })
  @swagger.ApiOkResponse({
    type: User,
    description: "Updated user with new city hall assignment"
  })
  @swagger.ApiForbiddenResponse({
    description: "Insufficient permissions - Admin only"
  })
  @swagger.ApiBadRequestResponse({
    description: "Invalid city hall ID or user not found"
  })
  @nestAccessControl.UseRoles({
    resource: "User",
    action: "update",
    possession: "any",
  })
  async updateUserCityHall(
    @common.Param("id") userId: string,
    @common.Body() body: { cityHallId: string },
    @UserData() userInfo: UserInfo
  ) {
    // Only admin can update city hall assignments
    if (!userInfo.roles.includes("admin")) {
      throw new common.ForbiddenException("Only admin can update city hall assignments");
    }

    // Verify the user exists
    const user = await this.service.user({
      where: { id: userId },
    });

    if (!user) {
      throw new common.NotFoundException("User not found");
    }

    // Verify the city hall exists
    const cityHall = await this.prisma.cityHall.findUnique({
      where: { id: body.cityHallId },
    });

    if (!cityHall) {
      throw new common.BadRequestException("City hall not found");
    }

    // Update the user's city hall assignment
    return this.service.updateUser({
      where: { id: userId },
      data: {
        cityHall: {
          connect: { id: body.cityHallId },
        },
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        roles: true,
        isActive: true,
        cityHall: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Update user with proper handling of cityHallId and roles
   */
  @common.Patch(":id/update")
  @swagger.ApiOperation({
    summary: "Update user with cityHallId and roles support",
    description: "Updates a user with proper handling of cityHallId (converts to cityHall object) and roles array"
  })
  @swagger.ApiOkResponse({
    type: User,
    description: "Updated user object"
  })
  @swagger.ApiNotFoundResponse({
    description: "User not found"
  })
  @swagger.ApiForbiddenResponse({
    description: "Insufficient permissions"
  })
  @nestAccessControl.UseRoles({
    resource: "User",
    action: "update",
    possession: "any",
  })
  async updateUserWithCityHall(
    @common.Param("id") userId: string,
    @common.Body() data: any,
    @UserData() userInfo: UserInfo
  ) {
    // Only admin can update users
    if (!userInfo.roles.includes("admin")) {
      throw new common.ForbiddenException("Only admin can update users");
    }
    // Convert cityHallId to cityHall object if provided
    const updateData: any = {
      ...data,
      password: data.password?.length ? data.password : undefined
    };



    console.log({updateData})
    if (data.cityHallId) {
      updateData.cityHall = {
        connect: { id: data.cityHallId }
      };
      delete updateData.cityHallId;
    }

    // Handle roles array
    if (data.roles && Array.isArray(data.roles)) {
      updateData.roles = data.roles;
    }


    return this.service.updateUser({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        roles: true,
        isActive: true,
        cityHall: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Get dashboard user's city hall information
   */
  @common.Get("dashboard/city-hall")
  @swagger.ApiOperation({
    summary: "Get dashboard user's city hall info",
    description: "Get the city hall information for the current dashboard user"
  })
  @swagger.ApiOkResponse({
    type: Object,
    description: "City hall information for the dashboard user"
  })
  @swagger.ApiForbiddenResponse({
    description: "Insufficient permissions - Dashboard users only"
  })
  @nestAccessControl.UseRoles({
    resource: "User",
    action: "read",
    possession: "own",
  })
  async getDashboardUserCityHall(@UserData() userInfo: UserInfo) {
    const user = await this.prisma.user.findUnique({
      where: { id: userInfo.id },
      include: {
        cityHall: true,
      },
    });

    if (!user) {
      throw new common.NotFoundException("User not found");
    }

    if (user.role !== "dashboard_user" && user.role !== "admin") {
      throw new common.ForbiddenException("This endpoint is only for dashboard users and admins");
    }

    // If admin has no city hall assigned, return all available city halls
    if (user.role === "admin" && !user.cityHall) {
      const allCityHalls = await this.prisma.cityHall.findMany({
        orderBy: { name: 'asc' },
      });
      return {
        message: "Admin has access to all city halls",
        cityHalls: allCityHalls.map(ch => ({
          id: ch.id,
          name: ch.name,
          description: ch.description,
          createdAt: ch.createdAt,
          updatedAt: ch.updatedAt,
        }))
      };
    }

    // For dashboard users or admins with city hall, return their assigned city hall
    if (!user.cityHall) {
      throw new common.NotFoundException("No city hall assigned to this user");
    }

    return {
      id: user.cityHall.id,
      name: user.cityHall.name,
      description: user.cityHall.description,
      createdAt: user.cityHall.createdAt,
      updatedAt: user.cityHall.updatedAt,
    };
  }
}
