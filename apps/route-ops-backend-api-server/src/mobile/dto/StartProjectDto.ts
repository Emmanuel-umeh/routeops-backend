import { ApiProperty } from "@nestjs/swagger";
import { IsISO8601, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString } from "class-validator";

export class StartProjectDto {
  @ApiProperty({
    description: "Longitude coordinate",
    example: -9.1393,
    type: Number,
  })
  @IsNumber()
  @IsLongitude()
  lng!: number;

  @ApiProperty({
    description: "Latitude coordinate",
    example: 38.7223,
    type: Number,
  })
  @IsNumber()
  @IsLatitude()
  lat!: number;

  @ApiProperty({
    description: "ISO 8601 date/time when project started",
    example: "2024-01-15T10:30:00Z",
    required: false,
  })
  @IsISO8601({ strict: false })
  @IsOptional()
  date?: string;

  @ApiProperty({
    description: "Optional remarks about the project",
    example: "Starting road inspection in downtown area",
    required: false,
  })
  @IsString()
  @IsOptional()
  remarks?: string;

    @ApiProperty({
        description: "Optional remarks about the project",
        example: "Starting road inspection in downtown area",
        required: false,
    })
    @IsString()
    @IsOptional()
     name?: string;
}


