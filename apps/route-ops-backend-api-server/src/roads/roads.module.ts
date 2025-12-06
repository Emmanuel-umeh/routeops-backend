import { Module } from "@nestjs/common";
import { RoadsController } from "./roads.controller";
import { RoadsService } from "./roads.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  controllers: [RoadsController],
  providers: [RoadsService],
  imports: [PrismaModule],
  exports: [RoadsService],
})
export class RoadsModule {}


