import { Injectable, UnauthorizedException, NotFoundException, BadRequestException } from "@nestjs/common";
import { Credentials } from "./Credentials";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { UserInfo } from "./UserInfo";
import { UserService } from "../user/user.service";
import { ForgotPasswordDto } from "./dto/ForgotPasswordDto";
import { ResetPasswordDto } from "./dto/ResetPasswordDto";
import { ForgotPasswordResponseDto } from "./dto/ForgotPasswordResponseDto";
import { ResetPasswordResponseDto } from "./dto/ResetPasswordResponseDto";
import { randomBytes } from "crypto";
import { CurrentUserResponseDto } from "./dto/CurrentUserResponseDto";
import { EmailService } from "../providers/email/email.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly userService: UserService,
    private readonly emailService: EmailService
  ) {}

  async validateUser(
    username: string,
    password: string
  ): Promise<UserInfo | null> {
    const user = await this.userService.user({
      where: { username },
    });
    if (user && (await this.passwordService.compare(password, user.password))) {
      // Check if user is active
      if (user.isActive === false) {
        throw new UnauthorizedException("Your account has been disabled. Please contact your administrator.");
      }
      const { id, roles } = user;
      const roleList = roles as string[];
      return { id, username, roles: roleList };
    }
    return null;
  }
  async login(credentials: Credentials): Promise<UserInfo> {
    const { username } = credentials;
    const user = await this.validateUser(credentials.username, credentials.password);
    if (!user) {
      throw new UnauthorizedException("The passed credentials are incorrect");
    }
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.createAccessToken({
        id: user.id,
        username,
      }),
      this.tokenService.createRefreshToken({
        id: user.id,
        username,
      }),
    ]);
    return {
      accessToken,
      refreshToken,
      ...user,
    };
  }

  async forgotPassword(data: ForgotPasswordDto): Promise<ForgotPasswordResponseDto> {
    const { usernameOrEmail } = data;
    
    // Find user by username or email
    const users = await this.userService.users({
      where: {
        OR: [
          { username: usernameOrEmail },
          { email: usernameOrEmail }
        ]
      }
    });
    const user = users.length > 0 ? users[0] : null;

    if (!user) {
      // Don't reveal if user exists or not for security
      return {
        message: "If an account with that username or email exists, password reset instructions have been sent."
      };
    }

    // Check if user has an email address
    if (!user.email) {
      // Don't reveal if user exists or not for security
      return {
        message: "If an account with that username or email exists, password reset instructions have been sent."
      };
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');
    
    // Set token expiration to 1 hour from now
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 1);
    
    // Store reset token and expiration in user record
    await this.userService.updateUser({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetTokenExpiresAt: tokenExpiresAt,
      }
    });

    // Send email with reset link
    try {
      await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    } catch (error) {
      // Log error but don't reveal to user for security
      console.error("Failed to send password reset email:", error);
      // Still return success message to prevent user enumeration
    }

    // In development, also return the token for testing
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    if (isDevelopment) {
      return {
        message: "Password reset instructions have been sent to your email address.",
        resetToken: resetToken
      };
    }
    
    return {
      message: "If an account with that username or email exists, password reset instructions have been sent."
    };
  }

  async resetPassword(data: ResetPasswordDto): Promise<ResetPasswordResponseDto> {
    const { token, newPassword } = data;
    
    // Find user by reset token
    const users = await this.userService.users({
      where: {
        passwordResetToken: token
      }
    });
    
    const user = users.length > 0 ? users[0] : null;

    if (!user) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    // Check if token has expired
    if (!user.passwordResetTokenExpiresAt || user.passwordResetTokenExpiresAt < new Date()) {
      // Clear the expired token
      await this.userService.updateUser({
        where: { id: user.id },
        data: {
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
        }
      });
      throw new BadRequestException("Invalid or expired reset token");
    }

    // Update password and clear reset token
    await this.userService.updateUser({
      where: { id: user.id },
      data: {
        password: newPassword, // This will be hashed by the service
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
      }
    });

    return {
      message: "Password has been reset successfully"
    };
  }

  async refreshToken(refreshToken: string): Promise<UserInfo> {
    const decoded = await this.tokenService.verifyRefreshToken(refreshToken);
    const user = await this.userService.user({
      where: { id: decoded.sub },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (user.isActive === false) {
      throw new UnauthorizedException("Your account has been disabled. Please contact your administrator.");
    }

    if (
      !Array.isArray(user.roles) ||
      typeof user.roles !== "object" ||
      user.roles === null
    ) {
      throw new Error("User roles is not a valid value");
    }

    const [accessToken, newRefreshToken] = await Promise.all([
      this.tokenService.createAccessToken({
        id: user.id,
        username: user.username,
      }),
      this.tokenService.createRefreshToken({
        id: user.id,
        username: user.username,
      }),
    ]);

    return {
      id: user.id,
      username: user.username,
      roles: user.roles as string[],
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async getCurrentUser(userId: string): Promise<CurrentUserResponseDto> {
    const user = await this.userService.user({
      where: { id: userId },
      include: {
        cityHall: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    if (
      !Array.isArray(user.roles) ||
      typeof user.roles !== "object" ||
      user.roles === null
    ) {
      throw new Error("User roles is not a valid value");
    }

    if (user.isActive === false) {
      throw new UnauthorizedException("Your account has been disabled. Please contact your administrator.");
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      roles: user.roles as string[],
      role: user.role ?? null,
      cityHall: (user as any).cityHall ?? null,
      isActive: user.isActive ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
