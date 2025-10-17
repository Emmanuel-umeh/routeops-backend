import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CityHallModuleBase } from "./base/cityHall.module.base";
import { CityHallService } from "./cityHall.service";
import { CityHallController } from "./cityHall.controller";

@Module({
  imports: [CityHallModuleBase, forwardRef(() => AuthModule)],
  controllers: [CityHallController],
  providers: [CityHallService],
  exports: [CityHallService],
})
export class CityHallModule {}
