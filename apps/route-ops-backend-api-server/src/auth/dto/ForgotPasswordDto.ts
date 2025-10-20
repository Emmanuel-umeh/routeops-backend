import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsEmail } from "class-validator";

export class ForgotPasswordDto {
  @ApiProperty({
    description: "Username or email address to send reset instructions to",
    example: "user@example.com",
    required: true,
  })
  @IsString()
  usernameOrEmail!: string;
}
