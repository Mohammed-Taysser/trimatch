import { z } from 'zod';

export const UserRoleSchema = z.enum([
  'requester',
  'approver',
  'purchasing',
  'warehouse',
  'ap',
  'admin',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string(),
  role: UserRoleSchema,
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: AuthUserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// When a user has TOTP 2FA enabled (869dzycut), login does not return a session.
// It returns a short-lived, single-purpose challenge to exchange for the access
// token via POST /auth/2fa/verify.
export const TwoFactorChallengeSchema = z.object({
  twoFactorRequired: z.literal(true),
  challenge: z.string(),
});
export type TwoFactorChallenge = z.infer<typeof TwoFactorChallengeSchema>;

// Login yields either a full session (no 2FA) or a challenge (2FA enabled).
export const LoginResultSchema = z.union([LoginResponseSchema, TwoFactorChallengeSchema]);
export type LoginResult = z.infer<typeof LoginResultSchema>;

// Self-service password reset (Epic 16). forgot-password takes an email and
// always acks the same (no account enumeration); reset-password redeems a
// single-use, time-limited OTP and sets a new password.
export const ForgotPasswordSchema = z.object({
  email: z.string().min(3),
});
export type ForgotPassword = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  email: z.string().min(3),
  code: z.string().regex(/^\d{6}$/, 'must be a 6-digit code'),
  newPassword: z.string().min(8, 'must be at least 8 characters'),
});
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;

// A deliberately opaque acknowledgement shared by both endpoints.
export const PasswordResetAckSchema = z.object({ ok: z.literal(true) });
export type PasswordResetAck = z.infer<typeof PasswordResetAckSchema>;

// Authenticated self-service password change (Epic 16): verify the current
// password, set a new one, and email a confirmation.
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'must be at least 8 characters'),
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

// Optional TOTP two-factor auth (869dzycut).
// Enrolment: /2fa/setup returns the otpauth URI (render as a QR) and the raw
// secret (manual entry); the user confirms a code to /2fa/enable, which returns
// the one-time recovery codes.
export const TwoFactorSetupResponseSchema = z.object({
  otpauthUri: z.string(),
  secret: z.string(),
});
export type TwoFactorSetupResponse = z.infer<typeof TwoFactorSetupResponseSchema>;

// A 6-digit TOTP code (enable confirms the authenticator is set up).
export const TwoFactorEnableSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'must be a 6-digit code'),
});
export type TwoFactorEnable = z.infer<typeof TwoFactorEnableSchema>;

export const TwoFactorEnableResponseSchema = z.object({
  recoveryCodes: z.array(z.string()),
});
export type TwoFactorEnableResponse = z.infer<typeof TwoFactorEnableResponseSchema>;

// verify/disable accept either a 6-digit TOTP code or a recovery code, so the
// length is looser than enrolment.
export const TwoFactorVerifySchema = z.object({
  challenge: z.string().min(1),
  code: z.string().min(6).max(40),
});
export type TwoFactorVerify = z.infer<typeof TwoFactorVerifySchema>;

export const TwoFactorDisableSchema = z.object({
  code: z.string().min(6).max(40),
});
export type TwoFactorDisable = z.infer<typeof TwoFactorDisableSchema>;
