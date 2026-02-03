import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsArray, IsNumber, IsEnum, MaxLength, IsDateString, IsBoolean } from "class-validator";
import { EnumProjectStatus } from "../base/EnumProjectStatus";

export class RoutePointDto {
  @ApiProperty({
    description: "Latitude coordinate",
    example: 38.7223,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({
    description: "Longitude coordinate", 
    example: -9.1393,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty({
    description: "Frame number for video synchronization",
    example: 100,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  frameNumber?: number;

  @ApiProperty({
    description: "Timestamp for the route point",
    example: 1640995200,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  timestamp?: number;
}

export class CreateProjectDto {
  @ApiProperty({
    description: "Project name",
    example: "Road Inspection Project",
    required: false,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  name?: string | null;

  @ApiProperty({
    description: "Project description",
    example: "A comprehensive road inspection project",
    required: false,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string | null;

  @ApiProperty({
    description: "Project status",
    enum: EnumProjectStatus,
    example: "active",
    required: false,
  })
  @IsEnum(EnumProjectStatus)
  @IsOptional()
  status?: "active" | "inactive" | "completed" | "pending" | null;

  @ApiProperty({
    description: "ID of the assigned user",
    example: "user123",
    required: false,
  })
  @IsString()
  @IsOptional()
  assignedUserId?: string | null;

  @ApiProperty({
    description: "ID of the city hall",
    example: "cityhall123",
    required: false,
  })
  @IsString()
  @IsOptional()
  cityHallId?: string | null;

  @ApiProperty({
    description: "Created by user identifier",
    example: "admin",
    required: false,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  createdBy?: string | null;

  @ApiProperty({
    description: "Video URL for the project",
    example: "https://example.com/video.mp4",
    required: false,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  videoUrl?: string | null;

  @ApiProperty({
    description: "Scheduled date for the project",
    example: "2025-12-25T10:00:00Z",
    required: false,
  })
  @IsDateString()
  @IsOptional()
  scheduledDate?: string | null;

  @ApiProperty({
    description: "Set to true when creating the project from the web (dashboard). Omit or false for mobile-created projects.",
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  createdFromWeb?: boolean;

  @ApiProperty({
    description: "Array of route points with coordinates",
    type: [RoutePointDto],
    required: false,
  })
  @IsArray()
  @IsOptional()
  routePoints?: RoutePointDto[];

  @ApiProperty({
    description: "Array of hazard IDs to connect",
    type: [String],
    required: false,
  })
  @IsArray()
  @IsOptional()
  hazardIds?: string[];

  @ApiProperty({
    description: "Array of survey IDs to connect",
    type: [String],
    required: false,
  })
  @IsArray()
  @IsOptional()
  surveyIds?: string[];
}
