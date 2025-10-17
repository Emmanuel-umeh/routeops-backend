import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CityHallServiceBase } from "./base/cityHall.service.base";

@Injectable()
export class CityHallService extends CityHallServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
