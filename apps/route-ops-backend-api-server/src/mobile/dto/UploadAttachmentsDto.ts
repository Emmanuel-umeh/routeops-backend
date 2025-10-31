import { IsArray, IsIn, IsString, IsUUID } from "class-validator";

export class UploadAttachmentsDto {
  @IsUUID()
  projectId!: string;

  @IsIn(["image", "video"]) 
  type!: "image" | "video";

  @IsArray()
  @IsString({ each: true })
  files!: string[]; // placeholder: file keys/URLs
}


