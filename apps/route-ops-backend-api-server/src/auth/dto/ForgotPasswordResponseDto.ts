import { ApiProperty } from "@nestjs/swagger";

export class ForgotPasswordResponseDto {
  @ApiProperty({
    description: "Success message",
    example: "Password reset instructions have been sent to your email address",
  })
  message!: string;

  @ApiProperty({
    description: "Reset token (only returned in development mode)",
    example: "abc123def456",
    required: false,
  })
  resetToken?: string;
}
