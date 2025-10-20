import { Body, Controller, Post, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { Credentials } from "../auth/Credentials";
import { UserInfo } from "./UserInfo";
import { UserData } from "./userData.decorator";
import { ForgotPasswordDto } from "./dto/ForgotPasswordDto";
import { ResetPasswordDto } from "./dto/ResetPasswordDto";
import { ForgotPasswordResponseDto } from "./dto/ForgotPasswordResponseDto";
import { ResetPasswordResponseDto } from "./dto/ResetPasswordResponseDto";

@ApiTags("auth")
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post("login")
  @ApiOperation({ summary: "User login" })
  @ApiResponse({ status: 200, description: "Login successful", type: UserInfo })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  async login(@Body() body: Credentials): Promise<UserInfo> {
    return this.authService.login(body);
  }

  @Post("forgot-password")
  @ApiOperation({ summary: "Request password reset" })
  @ApiResponse({ status: 200, description: "Reset instructions sent", type: ForgotPasswordResponseDto })
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<ForgotPasswordResponseDto> {
    return this.authService.forgotPassword(body);
  }

  @Post("reset-password")
  @ApiOperation({ summary: "Reset password with token" })
  @ApiResponse({ status: 200, description: "Password reset successful", type: ResetPasswordResponseDto })
  @ApiResponse({ status: 400, description: "Invalid or expired token" })
  async resetPassword(@Body() body: ResetPasswordDto): Promise<ResetPasswordResponseDto> {
    return this.authService.resetPassword(body);
  }

  @Get("userInfo")
  @ApiOperation({ summary: "Get current user information" })
  @ApiResponse({ status: 200, description: "Current user info", type: UserInfo })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async getUserInfo(@UserData() userInfo: UserInfo): Promise<UserInfo> {
    return userInfo;
  }
}
