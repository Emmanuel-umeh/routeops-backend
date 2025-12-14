import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsIn, IsString, IsUUID, IsOptional, ValidateNested, IsNumber, IsInt, Min } from "class-validator";
import { Type } from "class-transformer";

export class VideoMetadataItemDto {
  @ApiProperty({
    description: "Time in seconds within the video",
    example: 10,
  })
  @IsInt()
  @Min(0)
  videoTime!: number;

  @ApiProperty({
    description: "Latitude at this video time",
    example: 37.060899,
  })
  @IsNumber()
  lat!: number;

  @ApiProperty({
    description: "Longitude at this video time",
    example: -8.064873,
  })
  @IsNumber()
  lng!: number;
}

export class UploadAttachmentsDto {
  @ApiProperty({
    description: "UUID of the project",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsUUID()
  projectId!: string;

  @ApiProperty({
    description: "Type of attachment",
    enum: ["image", "video"],
    example: "image",
  })
  @IsIn(["image", "video"]) 
  type!: "image" | "video";

  @ApiProperty({
    description: "Array of file keys/URLs after uploading to Firebase Storage",
    example: ["projects/550e8400/.../image1.jpg", "projects/550e8400/.../image2.jpg"],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  files!: string[];

  @ApiProperty({
    description: "Array of video metadata entries (only used when type is 'video')",
    type: [VideoMetadataItemDto],
    required: false,
    example: [
      { videoTime: 10, lat: 37.060899, lng: -8.064873 },
      { videoTime: 20, lat: 37.061000, lng: -8.064900 },
      { videoTime: 30, lat: 37.061100, lng: -8.064950 },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VideoMetadataItemDto)
  videoMetadata?: VideoMetadataItemDto[];
}


