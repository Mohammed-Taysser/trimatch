import { LoginRequestSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class LoginRequestDto extends createZodDto(LoginRequestSchema) {}
