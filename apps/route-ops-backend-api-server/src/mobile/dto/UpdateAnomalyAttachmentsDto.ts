import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";

export class UpdateAnomalyAttachmentsDto {
  @ApiProperty({
    description: "External ID (mobileId) of the anomaly/hazard",
    example: "mobile-anomaly-123",
  })
  @IsString()
  externalId!: string;

  @ApiProperty({
    description: "Array of file URLs after uploading to Firebase Storage",
    example: ["https://firebasestorage.googleapis.com/.../image1.jpg"],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  files!: string[];
}

