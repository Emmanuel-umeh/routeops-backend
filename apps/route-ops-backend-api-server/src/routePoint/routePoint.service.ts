import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoutePointServiceBase } from "./base/routePoint.service.base";

@Injectable()
export class RoutePointService extends RoutePointServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
