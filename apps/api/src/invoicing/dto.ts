import { InvoiceCreateSchema, ResolutionRequestSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class InvoiceCreateDto extends createZodDto(InvoiceCreateSchema) {}
export class ResolutionRequestDto extends createZodDto(ResolutionRequestSchema) {}
