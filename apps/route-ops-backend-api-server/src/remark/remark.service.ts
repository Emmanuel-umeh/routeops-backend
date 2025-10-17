import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RemarkServiceBase } from "./base/remark.service.base";

@Injectable()
export class RemarkService extends RemarkServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
