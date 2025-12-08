import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private readonly fromEmail: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("RESEND_API_KEY");
    
    if (!apiKey) {
      this.logger.warn("RESEND_API_KEY not found. Email functionality will be disabled.");
    } else {
      this.resend = new Resend(apiKey);
    }

    this.fromEmail = this.configService.get<string>("EMAIL_FROM") || "noreply@routeops.com";
    this.frontendUrl = this.configService.get<string>("FRONTEND_URL") || "http://localhost:3000";
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    if (!this.resend) {
      this.logger.error("Resend client not initialized. Cannot send email.");
      throw new Error("Email service is not configured");
    }

    if (!email) {
      this.logger.warn("Cannot send password reset email: no email address provided");
      return;
    }

    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: "Reset Your Password - RouteOps",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
              <h1 style="color: #2c3e50; margin-top: 0;">Reset Your Password</h1>
            </div>
            
            <p>Hello,</p>
            
            <p>We received a request to reset your password for your RouteOps account. If you didn't make this request, you can safely ignore this email.</p>
            
            <p>To reset your password, click the button below:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Reset Password
              </a>
            </div>
            
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #3498db;">${resetUrl}</p>
            
            <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px;">
              <strong>Note:</strong> This link will expire in 1 hour for security reasons.
            </p>
            
            <p style="color: #7f8c8d; font-size: 12px;">
              If you continue to have problems, please contact support.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #95a5a6; font-size: 11px; text-align: center;">
              This is an automated message from RouteOps. Please do not reply to this email.
            </p>
          </body>
          </html>
        `,
      });

      if (error) {
        this.logger.error(`Failed to send password reset email: ${error.message}`, error);
        throw new Error(`Failed to send email: ${error.message}`);
      }

      this.logger.log(`Password reset email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Error sending password reset email to ${email}:`, error);
      throw error;
    }
  }
}
