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
