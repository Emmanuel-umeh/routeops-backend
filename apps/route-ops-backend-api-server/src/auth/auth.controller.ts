import {
  Body,
  Controller,
  Post,
  Get,
  UnauthorizedException,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { Credentials } from "../auth/Credentials";
import { UserInfo } from "./UserInfo";
import { UserData } from "./userData.decorator";
import { ForgotPasswordDto } from "./dto/ForgotPasswordDto";
import { ResetPasswordDto } from "./dto/ResetPasswordDto";
import { ForgotPasswordResponseDto } from "./dto/ForgotPasswordResponseDto";
import { ResetPasswordResponseDto } from "./dto/ResetPasswordResponseDto";
import { RefreshTokenDto } from "./dto/RefreshTokenDto";
import { CurrentUserResponseDto } from "./dto/CurrentUserResponseDto";
import { Request } from "express";
import { Public } from "../decorators/public.decorator";
import { DefaultAuthGuard } from "./defaultAuth.guard";

@ApiTags("auth")
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Public()
  @Post("login")
  @ApiOperation({ summary: "User login" })
  @ApiResponse({ status: 200, description: "Login successful", type: UserInfo })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  async login(@Body() body: Credentials): Promise<UserInfo> {
    return this.authService.login(body);
  }

  @Public()
  @Post("auth/login")
  @ApiOperation({ summary: "User login (legacy path)" })
  @ApiResponse({ status: 200, description: "Login successful", type: UserInfo })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  async loginAlias(@Body() body: Credentials): Promise<UserInfo> {
    return this.authService.login(body);
  }

  @Public()
  @Post("refresh")
  @ApiOperation({ summary: "Refresh access token" })
  @ApiResponse({ status: 200, description: "Tokens refreshed successfully", type: UserInfo })
  @ApiResponse({ status: 401, description: "Invalid or expired refresh token" })
  async refresh(@Body() body: RefreshTokenDto): Promise<UserInfo> {
    return this.authService.refreshToken(body.refreshToken);
  }

  @Public()
  @Post("auth/refresh")
  @ApiOperation({ summary: "Refresh access token (legacy path)" })
  @ApiResponse({ status: 200, description: "Tokens refreshed successfully", type: UserInfo })
  @ApiResponse({ status: 401, description: "Invalid or expired refresh token" })
  async refreshAlias(@Body() body: RefreshTokenDto): Promise<UserInfo> {
    return this.authService.refreshToken(body.refreshToken);
  }

  @Public()
  @Post("forgot-password")
  @ApiOperation({ summary: "Request password reset" })
  @ApiResponse({ status: 200, description: "Reset instructions sent", type: ForgotPasswordResponseDto })
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<ForgotPasswordResponseDto> {
    return this.authService.forgotPassword(body);
  }

  @Public()
  @Post("reset-password")
  @ApiOperation({ summary: "Reset password with token" })
  @ApiResponse({ status: 200, description: "Password reset successful", type: ResetPasswordResponseDto })
  @ApiResponse({ status: 400, description: "Invalid or expired token" })
  async resetPassword(@Body() body: ResetPasswordDto): Promise<ResetPasswordResponseDto> {
    return this.authService.resetPassword(body);
  }

  @UseGuards(DefaultAuthGuard)
  @Get("userInfo")
  @ApiOperation({ summary: "Get current user information" })
  @ApiResponse({ status: 200, description: "Current user info", type: CurrentUserResponseDto })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async getUserInfo(
    @UserData() userInfo: UserInfo | undefined,
    @Req() request: Request
  ): Promise<CurrentUserResponseDto> {
    const currentUser = userInfo ?? (request.user as UserInfo | undefined);
    if (!currentUser) {
      throw new UnauthorizedException();
    }
    return this.authService.getCurrentUser(currentUser.id);
  }

  @UseGuards(DefaultAuthGuard)
  @Get("auth/me")
  @ApiOperation({ summary: "Get current user information (alias)" })
  @ApiResponse({ status: 200, description: "Current user info", type: CurrentUserResponseDto })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async getCurrentUser(
    @UserData() userInfo: UserInfo | undefined,
    @Req() request: Request
  ): Promise<CurrentUserResponseDto> {
    const currentUser = userInfo ?? (request.user as UserInfo | undefined);
    if (!currentUser) {
      throw new UnauthorizedException();
    }
    return this.authService.getCurrentUser(currentUser.id);
  }
}
