import { Module } from "@nestjs/common";
import { CityHallModule } from "./cityHall/cityHall.module";
import { RoutePointModule } from "./routePoint/routePoint.module";
import { ProjectModule } from "./project/project.module";
import { RemarkModule } from "./remark/remark.module";
import { HazardModule } from "./hazard/hazard.module";
import { SurveyModule } from "./survey/survey.module";
import { UserModule } from "./user/user.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SecretsManagerModule } from "./providers/secrets/secretsManager.module";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ServeStaticOptionsService } from "./serveStaticOptions.service";
import { ConfigModule } from "@nestjs/config";

import { ACLModule } from "./auth/acl.module";
import { AuthModule } from "./auth/auth.module";
import { MobileModule } from "./mobile/mobile.module";
import { RoadsModule } from "./roads/roads.module";

@Module({
  controllers: [],
  imports: [
    ACLModule,
    AuthModule,
    CityHallModule,
    RoutePointModule,
    ProjectModule,
    RemarkModule,
    HazardModule,
    SurveyModule,
    UserModule,
    MobileModule,
    RoadsModule,
    HealthModule,
    PrismaModule,
    SecretsManagerModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRootAsync({
      useClass: ServeStaticOptionsService,
    }),
  ],
  providers: [],
})
export class AppModule {}
