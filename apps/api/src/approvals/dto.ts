import { RejectRequestSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class RejectRequestDto extends createZodDto(RejectRequestSchema) {}
