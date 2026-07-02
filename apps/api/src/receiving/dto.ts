import { GrnCreateSchema, GrnListQuerySchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class GrnCreateDto extends createZodDto(GrnCreateSchema) {}
export class GrnListQueryDto extends createZodDto(GrnListQuerySchema) {}
