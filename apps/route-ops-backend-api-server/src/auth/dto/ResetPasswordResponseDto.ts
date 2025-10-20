import { ApiProperty } from "@nestjs/swagger";

export class ResetPasswordResponseDto {
  @ApiProperty({
    description: "Success message",
    example: "Password has been reset successfully",
  })
  message!: string;
}
