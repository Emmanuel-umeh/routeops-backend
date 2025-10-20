import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ResetPasswordDto {
  @ApiProperty({
    description: "Reset token received via email",
    example: "abc123def456",
    required: true,
  })
  @IsString()
  token!: string;

  @ApiProperty({
    description: "New password (minimum 6 characters)",
    example: "newpassword123",
    required: true,
  })
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
