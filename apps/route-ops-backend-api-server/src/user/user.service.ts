import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordService } from "../auth/password.service";
import { UserServiceBase } from "./base/user.service.base";
import { Prisma } from "@prisma/client";

@Injectable()
export class UserService extends UserServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly passwordService: PasswordService
  ) {
    super(prisma, passwordService);
  }

  /**
   * Get users filtered by role and city hall based on the requesting user's permissions
   */
  async getUsersByRoleAndCityHall(
    requestingUserId: string,
    requestingUserRole: string,
    requestingUserCityHallId?: string,
    targetRole?: string,
    targetCityHallId?: string
  ) {
    const where: Prisma.UserWhereInput = {};

    // Admin can see all users
    if (requestingUserRole === "admin") {
      if (targetRole) {
        where.role = targetRole as any;
      }
      if (targetCityHallId) {
        where.cityHallId = targetCityHallId;
      }
    }
    // Dashboard User can only see users from their city hall
    else if (requestingUserRole === "dashboard_user") {
      where.cityHallId = requestingUserCityHallId;
      // Dashboard users can only manage app users
      if (targetRole) {
        where.role = targetRole === "app_user" ? ("app_user" as any) : undefined;
      } else {
        where.role = "app_user" as any;
      }
    }
    // App User can only see themselves
    else if (requestingUserRole === "app_user") {
      where.id = requestingUserId;
    }

    return this.prisma.user.findMany({
      where,
      include: {
        cityHall: true,
      },
    });
  }

  /**
   * Create user with role-based validation
   */
  async createUserWithRoleValidation(
    data: Prisma.UserCreateInput,
    creatorRole: string,
    creatorCityHallId?: string
  ) {
    // Validate role assignment based on creator's role
    if (creatorRole === "dashboard_user") {
      // Dashboard users can only create app users
      if (data.role !== "app_user") {
        throw new Error("Dashboard users can only create app users");
      }
      // Dashboard users can only assign users to their city hall
      if (creatorCityHallId && data.cityHall?.connect?.id !== creatorCityHallId) {
        throw new Error("Dashboard users can only assign users to their city hall");
      }
    } else if (creatorRole === "app_user") {
      throw new Error("App users cannot create other users");
    }

    return this.prisma.user.create({
      data: {
        ...data,
        password: await this.passwordService.hash(data.password),
      },
      include: {
        cityHall: true,
      },
    });
  }

  /**
   * Get dashboard users (admin only)
   */
  async getDashboardUsers() {
    return this.prisma.user.findMany({
      where: {
        role: "dashboard_user",
      },
      include: {
        cityHall: true,
      },
    });
  }

  /**
   * Get app users filtered by city hall
   */
  async getAppUsers(cityHallId?: string) {
    const where: Prisma.UserWhereInput = {
      role: "app_user",
    };

    if (cityHallId) {
      where.cityHallId = cityHallId;
    }

    return this.prisma.user.findMany({
      where,
      include: {
        cityHall: true,
      },
    });
  }

  /**
   * Get users by city hall
   */
  async getUsersByCityHall(cityHallId: string) {
    return this.prisma.user.findMany({
      where: {
        cityHallId,
      },
      include: {
        cityHall: true,
      },
    });
  }
}
