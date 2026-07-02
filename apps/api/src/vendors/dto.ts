import { VendorCreateSchema, VendorUpdateSchema } from '@trimatch/shared';
import { createZodDto } from 'nestjs-zod';

export class VendorCreateDto extends createZodDto(VendorCreateSchema) {}
export class VendorUpdateDto extends createZodDto(VendorUpdateSchema) {}
