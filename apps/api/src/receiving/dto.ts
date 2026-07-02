import { GrnCreateSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class GrnCreateDto extends createZodDto(GrnCreateSchema) {}
