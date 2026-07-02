import { z } from 'zod';
import { CurrencySchema } from './requisitions';

export const VendorCreateSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().min(3).max(200),
  currency: CurrencySchema,
  paymentTerms: z.string().min(1).max(50), // e.g. "NET 30"
  active: z.boolean().optional(),
});
export type VendorCreate = z.infer<typeof VendorCreateSchema>;

export const VendorUpdateSchema = VendorCreateSchema.partial();
export type VendorUpdate = z.infer<typeof VendorUpdateSchema>;

export const VendorSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  contactEmail: z.string(),
  currency: CurrencySchema,
  paymentTerms: z.string(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Vendor = z.infer<typeof VendorSchema>;
export const VendorListSchema = z.array(VendorSchema);
