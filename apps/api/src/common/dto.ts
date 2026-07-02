import { PaginationQuerySchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class PaginationQueryDto extends createZodDto(PaginationQuerySchema) {}
