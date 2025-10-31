import { IsISO8601, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString } from "class-validator";

export class StartProjectDto {
  @IsNumber()
  @IsLongitude()
  lng!: number;

  @IsNumber()
  @IsLatitude()
  lat!: number;

  @IsISO8601({ strict: false })
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}


