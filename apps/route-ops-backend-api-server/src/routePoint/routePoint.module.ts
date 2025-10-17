import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RoutePointModuleBase } from "./base/routePoint.module.base";
import { RoutePointService } from "./routePoint.service";
import { RoutePointController } from "./routePoint.controller";

@Module({
  imports: [RoutePointModuleBase, forwardRef(() => AuthModule)],
  controllers: [RoutePointController],
  providers: [RoutePointService],
  exports: [RoutePointService],
})
export class RoutePointModule {}
