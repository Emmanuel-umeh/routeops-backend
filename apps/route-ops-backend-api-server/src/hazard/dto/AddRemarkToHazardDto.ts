import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, MaxLength } from "class-validator";

export class AddRemarkToHazardDto {
  @ApiProperty({
    description: "Remark text content",
    example: "This pothole needs immediate attention. It's causing traffic issues.",
    required: true,
  })
  @IsString()
  @MaxLength(1000)
  text!: string;

  @ApiProperty({
    description: "Timestamp for the remark (optional, defaults to current time)",
    example: "2024-01-15T10:30:00Z",
    required: false,
  })
  @IsString()
  @IsOptional()
  timestamp?: string;
}
