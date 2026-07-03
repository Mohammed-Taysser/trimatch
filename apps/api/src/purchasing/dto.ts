import {
  ConvertRequisitionSchema,
  PoAmendSchema,
  PoLinesUpdateSchema,
  PoListQuerySchema,
} from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class ConvertRequisitionDto extends createZodDto(ConvertRequisitionSchema) {}
export class PoLinesUpdateDto extends createZodDto(PoLinesUpdateSchema) {}
export class PoAmendDto extends createZodDto(PoAmendSchema) {}
export class PoListQueryDto extends createZodDto(PoListQuerySchema) {}
