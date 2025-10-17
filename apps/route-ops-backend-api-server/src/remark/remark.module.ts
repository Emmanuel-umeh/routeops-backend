import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RemarkModuleBase } from "./base/remark.module.base";
import { RemarkService } from "./remark.service";
import { RemarkController } from "./remark.controller";

@Module({
  imports: [RemarkModuleBase, forwardRef(() => AuthModule)],
  controllers: [RemarkController],
  providers: [RemarkService],
  exports: [RemarkService],
})
export class RemarkModule {}
