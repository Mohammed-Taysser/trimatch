import { z } from 'zod';

export const RequisitionStatusSchema = z.enum([
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'converted',
]);
export type RequisitionStatus = z.infer<typeof RequisitionStatusSchema>;

export const CurrencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO 4217 code like USD');

// All money is integer minor units (domain invariant I-8).
export const RequisitionLineInputSchema = z.object({
  description: z.string().min(1).max(500),
  category: z.string().min(1).max(100),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
});
export type RequisitionLineInput = z.infer<typeof RequisitionLineInputSchema>;

export const RequisitionCreateSchema = z.object({
  justification: z.string().min(1).max(2000),
  neededBy: z.iso.date(),
  currency: CurrencySchema,
  lines: z.array(RequisitionLineInputSchema).min(1, 'at least one line is required'),
});
export type RequisitionCreate = z.infer<typeof RequisitionCreateSchema>;

// Draft edits replace the whole document (header + lines).
export const RequisitionUpdateSchema = RequisitionCreateSchema;
export type RequisitionUpdate = z.infer<typeof RequisitionUpdateSchema>;

export const RequisitionLineSchema = RequisitionLineInputSchema.extend({
  id: z.uuid(),
  lineNo: z.number().int().positive(),
  lineTotalMinor: z.number().int().nonnegative(),
});
export type RequisitionLine = z.infer<typeof RequisitionLineSchema>;

export const RequisitionSchema = z.object({
  id: z.uuid(),
  requesterId: z.uuid(),
  status: RequisitionStatusSchema,
  justification: z.string(),
  neededBy: z.iso.date(),
  currency: CurrencySchema,
  totalMinor: z.number().int().nonnegative(),
  lines: z.array(RequisitionLineSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Requisition = z.infer<typeof RequisitionSchema>;

// Composite schemas live here so consumers never mix zod instances
// (the web bundle and this package each carry their own copy of zod).
export const RequisitionListSchema = z.array(RequisitionSchema);
