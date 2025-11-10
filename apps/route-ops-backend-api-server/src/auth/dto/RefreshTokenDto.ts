import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class RefreshTokenDto {
  @ApiProperty({
    description: "Refresh token issued during login used to obtain new access credentials",
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    required: true,
  })
  @IsString()
  refreshToken!: string;
}

