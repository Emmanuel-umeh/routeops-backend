# Password Reset Flow Setup

This document describes the password reset flow implementation and setup instructions.

## Overview

The password reset flow has been integrated with Resend for email delivery. Users can request a password reset by providing their username or email, and will receive an email with a reset link that expires in 1 hour.

## Environment Variables

Add the following environment variables to your `.env` file:

```env
# Resend API Key (required for email functionality)
RESEND_API_KEY=re_VBuoJJdL_C44DC44jgkJ57c8KVyusSSjc

# Email sender address (optional, defaults to noreply@routeops.com)
EMAIL_FROM=noreply@routeops.com

# Frontend URL for reset password links (optional, defaults to http://localhost:3000)
FRONTEND_URL=http://localhost:3000
```

## Database Migration

The password reset feature requires new fields in the User model. Run the following command to create and apply the migration:

```bash
npm run db:migrate-save
```

Or if you prefer to push the schema changes directly:

```bash
npm run prisma:push
```

## API Endpoints

### POST /forgot-password

Request a password reset email.

**Request Body:**
```json
{
  "usernameOrEmail": "user@example.com"
}
```

**Response:**
```json
{
  "message": "If an account with that username or email exists, password reset instructions have been sent."
}
```

**Development Mode:**
In development mode (`NODE_ENV !== 'production'`), the response also includes the reset token for testing:
```json
{
  "message": "Password reset instructions have been sent to your email address.",
  "resetToken": "abc123..."
}
```

### POST /reset-password

Reset password using the token from the email.

**Request Body:**
```json
{
  "token": "abc123...",
  "newPassword": "newSecurePassword123"
}
```

**Response:**
```json
{
  "message": "Password has been reset successfully"
}
```

**Error Responses:**
- `400 Bad Request`: "Invalid or expired reset token"

## Features

- **Secure token generation**: Uses cryptographically secure random bytes
- **Token expiration**: Reset tokens expire after 1 hour
- **Email delivery**: Integrated with Resend for reliable email delivery
- **Security best practices**: 
  - Doesn't reveal if a user exists (prevents user enumeration)
  - Tokens are cleared after use or expiration
  - Passwords are hashed using bcrypt

## Email Template

The password reset email includes:
- A styled HTML email with a reset button
- A direct link to reset the password
- Clear expiration notice (1 hour)
- Professional branding

## Testing

1. Ensure all environment variables are set
2. Run the database migration
3. Start the server: `npm run start`
4. Test the flow:
   - Request password reset: `POST /forgot-password`
   - Check email or use the `resetToken` from development response
   - Reset password: `POST /reset-password`

## Troubleshooting

### Email not sending
- Verify `RESEND_API_KEY` is set correctly
- Check server logs for email service errors
- Ensure the user has an email address in the database

### Migration errors
- Ensure database connection is working
- Check Prisma schema is valid: `npx prisma format`
- Regenerate Prisma client: `npm run prisma:generate`

### Token not working
- Verify token hasn't expired (1 hour limit)
- Check token hasn't been used already
- Ensure database migration was applied successfully
