import { InvoiceCreateSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class InvoiceCreateDto extends createZodDto(InvoiceCreateSchema) {}
