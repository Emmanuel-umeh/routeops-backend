import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { HazardServiceBase } from "./base/hazard.service.base";

@Injectable()
export class HazardService extends HazardServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
