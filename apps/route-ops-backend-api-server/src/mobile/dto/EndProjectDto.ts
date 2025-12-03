import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Min, ValidateNested, IsNumber } from "class-validator";

export class NumAttachmentsDto {
  @ApiProperty({
    description: "Number of images uploaded",
    example: 5,
    type: Number,
  })
  @IsInt()
  @Min(0)
  images!: number;

  @ApiProperty({
    description: "Number of videos uploaded",
    example: 1,
    type: Number,
  })
  @IsInt()
  @Min(0)
  video!: number;
}

export class GeometryFeaturePropertiesDto {
  @ApiProperty({
    description: "Timestamp when point was recorded",
    example: "2024-01-15T10:30:00Z",
    required: false,
  })
  @IsOptional()
  @IsString()
  recorded_at?: string;

  @ApiProperty({
    description: "eIRI (International Roughness Index) value for this point",
    example: 2.5,
    required: false,
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  eIri?: number;

  @ApiProperty({
    description: "Video frame reference",
    example: "frame_12345",
    required: false,
  })
  @IsOptional()
  @IsString()
  videoframe?: string;

  @IsOptional()
  @IsString()
  edgeId?: string;

  @ApiProperty({
    description: "Direction of travel",
    enum: ["forward", "backward"],
    example: "forward",
    required: false,
  })
  @IsOptional()
  @IsIn(["forward", "backward"]) 
  direction?: string;
}

export class GeometryFeatureDto {
  @ApiProperty({
    description: "GeoJSON feature type",
    example: "Feature",
    enum: ["Feature"],
  })
  @IsString()
  type!: "Feature";

  @ApiProperty({
    description: "Feature properties",
    type: GeometryFeaturePropertiesDto,
  })
  @ValidateNested()
  @Type(() => GeometryFeaturePropertiesDto)
  properties!: GeometryFeaturePropertiesDto;

  @ApiProperty({
    description: "GeoJSON geometry (Point)",
    example: { type: "Point", coordinates: [-9.1393, 38.7223] },
  })
  @IsObject()
  geometry!: { type: "Point"; coordinates: [number, number] };
}

export class GeometryDto {
  @ApiProperty({
    description: "GeoJSON FeatureCollection type",
    example: "FeatureCollection",
    enum: ["FeatureCollection"],
  })
  @IsString()
  type!: "FeatureCollection";

  @ApiProperty({
    description: "Array of GeoJSON features",
    type: [GeometryFeatureDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeometryFeatureDto)
  features!: GeometryFeatureDto[];
}

export class AnomalyDto {
  @ApiProperty({
    description: "Optional anomaly ID",
    example: "anomaly_123",
    required: false,
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    description: "Latitude of the anomaly",
    example: 38.7223,
    type: Number,
  })
  @IsNumber()
  lat!: number;

  @ApiProperty({
    description: "Longitude of the anomaly",
    example: -9.1393,
    type: Number,
  })
  @IsNumber()
  lng!: number;

  @ApiProperty({
    description: "Name of the anomaly (optional, for display purposes)",
    example: "Pothole #1",
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: "Remarks about the anomaly",
    example: "Deep pothole, needs immediate repair",
    required: false,
  })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({
    description: "Severity level of the anomaly",
    example: "high",
    required: false,
  })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiProperty({
    description: "Address of the anomaly location",
    example: "123 Main Street",
    required: false,
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({
    description: "Whether the anomaly has an attachment",
    example: true,
    required: false,
    type: Boolean,
  })
  @IsOptional()
  hasAttachment?: boolean;
}

export class EndProjectDto {
  @ApiProperty({
    description: "UUID of the project to end",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsUUID()
  projectId!: string;

  @ApiProperty({
    description: "Number of attachments uploaded",
    type: NumAttachmentsDto,
  })
  @ValidateNested()
  @Type(() => NumAttachmentsDto)
  numAttachments!: NumAttachmentsDto;

  @ApiProperty({
    description: "GeoJSON FeatureCollection containing route geometry",
    type: GeometryDto,
  })
  @ValidateNested()
  @Type(() => GeometryDto)
  geometry!: GeometryDto;

  @ApiProperty({
    description: "Array of anomalies/hazards found during the project",
    type: [AnomalyDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnomalyDto)
  anomalies!: AnomalyDto[];

  @ApiProperty({
    description: "ISO 8601 date/time when project actually started (for offline sync)",
    example: "2024-01-23T10:30:00Z",
    required: false,
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({
    description: "ISO 8601 date/time when project actually ended (for offline sync)",
    example: "2024-01-23T14:30:00Z",
    required: false,
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}


