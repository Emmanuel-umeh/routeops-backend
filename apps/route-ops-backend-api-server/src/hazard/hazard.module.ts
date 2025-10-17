import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HazardModuleBase } from "./base/hazard.module.base";
import { HazardService } from "./hazard.service";
import { HazardController } from "./hazard.controller";

@Module({
  imports: [HazardModuleBase, forwardRef(() => AuthModule)],
  controllers: [HazardController],
  providers: [HazardService],
  exports: [HazardService],
})
export class HazardModule {}
