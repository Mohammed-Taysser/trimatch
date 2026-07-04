import { ForgotPasswordSchema, LoginRequestSchema, ResetPasswordSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class LoginRequestDto extends createZodDto(LoginRequestSchema) {}
export class ForgotPasswordDto extends createZodDto(ForgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(ResetPasswordSchema) {}
