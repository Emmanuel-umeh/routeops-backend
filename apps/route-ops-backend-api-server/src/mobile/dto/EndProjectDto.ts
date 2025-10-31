import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Min, ValidateNested, IsNumber } from "class-validator";

class NumAttachmentsDto {
  @IsInt()
  @Min(0)
  images!: number;

  @IsInt()
  @Min(0)
  video!: number;
}

class GeometryFeaturePropertiesDto {
  @IsOptional()
  @IsString()
  recorded_at?: string;

  @IsOptional()
  @IsNumber()
  eIri?: number;

  @IsOptional()
  @IsString()
  videoframe?: string;

  @IsOptional()
  @IsString()
  edgeId?: string;

  @IsOptional()
  @IsIn(["forward", "backward"]) 
  direction?: string;
}

class GeometryFeatureDto {
  @IsString()
  type!: "Feature";

  @ValidateNested()
  @Type(() => GeometryFeaturePropertiesDto)
  properties!: GeometryFeaturePropertiesDto;

  @IsObject()
  geometry!: { type: "Point"; coordinates: [number, number] };
}

class GeometryDto {
  @IsString()
  type!: "FeatureCollection";

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeometryFeatureDto)
  features!: GeometryFeatureDto[];
}

class AnomalyDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  hasAttachment?: boolean;
}

export class EndProjectDto {
  @IsUUID()
  projectId!: string;

  @ValidateNested()
  @Type(() => NumAttachmentsDto)
  numAttachments!: NumAttachmentsDto;

  @ValidateNested()
  @Type(() => GeometryDto)
  geometry!: GeometryDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnomalyDto)
  anomalies!: AnomalyDto[];
}


