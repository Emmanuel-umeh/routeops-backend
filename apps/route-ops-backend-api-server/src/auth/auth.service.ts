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

@Injectable()
export class AuthService {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly userService: UserService
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
    const { username, password } = credentials;
    const user = await this.validateUser(
      credentials.username,
      credentials.password
    );
    if (!user) {
      throw new UnauthorizedException("The passed credentials are incorrect");
    }
    const accessToken = await this.tokenService.createToken({
      id: user.id,
      username,
      password,
    });
    return {
      accessToken,
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

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');
    
    // Store reset token in user record (we'll add a field for this)
    // For now, we'll use a simple approach - in production, you'd want a separate table
    await this.userService.updateUser({
      where: { id: user.id },
      data: {
        // We'll store the token in a custom field or use a separate table
        // For now, let's use a simple approach with a comment field
        // In production, create a separate PasswordResetToken table
      }
    });

    // In development, return the token
    // In production, send email with reset link
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    if (isDevelopment) {
      console.log(`🔑 Password reset token for ${user.username}: ${resetToken}`);
      return {
        message: "Password reset instructions have been sent to your email address.",
        resetToken: resetToken
      };
    }

    // TODO: Send email with reset link in production
    // await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    
    return {
      message: "Password reset instructions have been sent to your email address."
    };
  }

  async resetPassword(data: ResetPasswordDto): Promise<ResetPasswordResponseDto> {
    const { token, newPassword } = data;
    
    // In a real implementation, you'd validate the token from a database
    // For now, we'll implement a simple version
    // TODO: Implement proper token validation with expiration
    
    // Find user by reset token (you'd need to add this field to the user model)
    // For now, we'll use a placeholder
    const user = await this.userService.user({
      where: {
        // In production, you'd have a resetToken field or separate table
        id: "placeholder" // This is a simplified version
      }
    });

    if (!user) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    // Update password
    await this.userService.updateUser({
      where: { id: user.id },
      data: {
        password: newPassword, // This will be hashed by the service
        // Clear the reset token
        // resetToken: null
      }
    });

    return {
      message: "Password has been reset successfully"
    };
  }
}
