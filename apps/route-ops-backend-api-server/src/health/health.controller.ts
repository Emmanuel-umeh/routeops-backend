import { Controller, Post, Body } from "@nestjs/common";
import { HealthControllerBase } from "./base/health.controller.base";
import { HealthService } from "./health.service";
import { Public } from "../decorators/public.decorator";

@Controller("_health")
export class HealthController extends HealthControllerBase {
  constructor(protected readonly healthService: HealthService) {
    super(healthService);
  }

  @Public()
  @Post("test-large-payload")
  async testLargePayload(@Body() body: any): Promise<{ 
    success: boolean; 
    receivedSize: number; 
    message: string 
  }> {
    const bodyString = JSON.stringify(body);
    const sizeInBytes = Buffer.byteLength(bodyString, 'utf8');
    const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
    
    return {
      success: true,
      receivedSize: sizeInBytes,
      message: `Successfully received payload of ${sizeInMB} MB`
    };
  }
}
