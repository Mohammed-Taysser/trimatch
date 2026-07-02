import { z } from 'zod';
import { CurrencySchema } from './requisitions';

export const PoStatusSchema = z.enum([
  'draft',
  'issued',
  // FR-604: an amendment that raises the total parks the PO here until an
  // approver signs it off; receiving and invoicing are blocked meanwhile.
  'pending_reapproval',
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
  version: z.number().int().positive(),
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

// FR-604: amend quantity and/or unit price on issued POs — every amendment
// creates version N+1; a total increase requires re-approval (TC-603).
export const PoAmendLineSchema = z
  .object({
    poLineId: z.uuid(),
    quantity: z.number().int().positive().optional(),
    unitPriceMinor: z.number().int().nonnegative().optional(),
  })
  .refine((line) => line.quantity !== undefined || line.unitPriceMinor !== undefined, {
    message: 'a line amendment must change quantity or unit price',
  });
export const PoAmendSchema = z.object({
  reason: z.string().min(1).max(500),
  lines: z.array(PoAmendLineSchema).min(1, 'at least one line is required'),
});
export type PoAmend = z.infer<typeof PoAmendSchema>;

export const PoVersionSchema = z.object({
  version: z.number().int().positive(),
  current: z.boolean(),
  totalMinor: z.number().int().nonnegative(),
  lines: z.array(
    z.object({
      poLineId: z.uuid(),
      lineNo: z.number().int().positive(),
      description: z.string(),
      quantity: z.number().int().positive(),
      unitPriceMinor: z.number().int().nonnegative(),
      lineTotalMinor: z.number().int().nonnegative(),
    }),
  ),
  // why (and when) this version was superseded — null on the current version
  supersededReason: z.string().nullable(),
  supersededAt: z.string().nullable(),
});
export type PoVersion = z.infer<typeof PoVersionSchema>;
export const PoVersionListSchema = z.array(PoVersionSchema);
