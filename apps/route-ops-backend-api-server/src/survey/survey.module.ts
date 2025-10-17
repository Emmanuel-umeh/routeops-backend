import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SurveyModuleBase } from "./base/survey.module.base";
import { SurveyService } from "./survey.service";
import { SurveyController } from "./survey.controller";

@Module({
  imports: [SurveyModuleBase, forwardRef(() => AuthModule)],
  controllers: [SurveyController],
  providers: [SurveyService],
  exports: [SurveyService],
})
export class SurveyModule {}
