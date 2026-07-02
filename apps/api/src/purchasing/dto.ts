import { ConvertRequisitionSchema, PoLinesUpdateSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class ConvertRequisitionDto extends createZodDto(ConvertRequisitionSchema) {}
export class PoLinesUpdateDto extends createZodDto(PoLinesUpdateSchema) {}
