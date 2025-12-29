import { Module } from "@nestjs/common";
import { MobileController } from "./mobile.controller";
import { MobileService } from "./mobile.service";
import { PrismaModule } from "../prisma/prisma.module";
import { RoadsModule } from "../roads/roads.module";

@Module({
  imports: [PrismaModule, RoadsModule],
  controllers: [MobileController],
  providers: [MobileService],
})
export class MobileModule {}


