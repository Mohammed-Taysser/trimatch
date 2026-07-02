import { RequisitionCreateSchema, RequisitionUpdateSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class RequisitionCreateDto extends createZodDto(RequisitionCreateSchema) {}
export class RequisitionUpdateDto extends createZodDto(RequisitionUpdateSchema) {}
