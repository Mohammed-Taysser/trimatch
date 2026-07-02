import { z } from 'zod';
import { CurrencySchema } from './requisitions';

export const PoStatusSchema = z.enum([
  'draft',
  'issued',
  'partially_received',
  'received',
  'closed',
  'cancelled',
]);
export type PoStatus = z.infer<typeof PoStatusSchema>;

// All money in integer minor units (I-8). vendorSku is set by purchasing
// while the PO is a draft (FR-201).
export const PoLineInputSchema = z.object({
  description: z.string().min(1).max(500),
  category: z.string().min(1).max(100),
  vendorSku: z.string().max(100).nullable().optional(),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
});
export type PoLineInput = z.infer<typeof PoLineInputSchema>;

export const PoLineSchema = PoLineInputSchema.extend({
  id: z.uuid(),
  lineNo: z.number().int().positive(),
  vendorSku: z.string().nullable(),
  lineTotalMinor: z.number().int().nonnegative(),
  // Populated on PO detail views once receiving exists (I-2 open-qty math).
  receivedQuantity: z.number().int().nonnegative().optional(),
  openQuantity: z.number().int().nonnegative().optional(),
  damagedQuantity: z.number().int().nonnegative().optional(),
});
export type PoLine = z.infer<typeof PoLineSchema>;

export const PurchaseOrderSchema = z.object({
  id: z.uuid(),
  poNumber: z.string().nullable(),
  status: PoStatusSchema,
  vendorId: z.uuid(),
  vendorName: z.string(),
  requisitionId: z.uuid(),
  currency: CurrencySchema,
  totalMinor: z.number().int().nonnegative(),
  lines: z.array(PoLineSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;
export const PurchaseOrderListSchema = z.array(PurchaseOrderSchema);

export const ConvertRequisitionSchema = z.object({
  requisitionId: z.uuid(),
  vendorId: z.uuid(),
});
export type ConvertRequisition = z.infer<typeof ConvertRequisitionSchema>;

export const PoLinesUpdateSchema = z.object({
  lines: z.array(PoLineInputSchema).min(1, 'at least one line is required'),
});
export type PoLinesUpdate = z.infer<typeof PoLinesUpdateSchema>;
