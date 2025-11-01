import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsIn, IsString, IsUUID } from "class-validator";

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
}


