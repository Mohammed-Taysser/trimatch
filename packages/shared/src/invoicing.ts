import { z } from 'zod';
import { CurrencySchema } from './requisitions';

export const InvoiceStatusSchema = z.enum([
  'entered',
  'matched',
  'exception',
  'variance_accepted',
  'awaiting_credit_note',
  'payable',
  'rejected',
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

// All money in integer minor units (I-8).
export const InvoiceCreateSchema = z.object({
  poId: z.uuid(),
  invoiceNumber: z.string().min(1).max(50),
  invoiceDate: z.iso.date(),
  dueDate: z.iso.date().optional(),
  taxMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  // Final settlement for the PO — under-delivery is judged on final invoices
  // (PRD cases E vs G; close-short).
  isFinal: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        poLineId: z.uuid(),
        quantity: z.number().int().positive(),
        unitPriceMinor: z.number().int().nonnegative(),
      }),
    )
    .min(1, 'at least one line is required'),
});
export type InvoiceCreate = z.infer<typeof InvoiceCreateSchema>;

export const InvoiceSchema = z.object({
  id: z.uuid(),
  invoiceNumber: z.string(),
  vendorId: z.uuid(),
  vendorName: z.string(),
  poId: z.uuid(),
  poNumber: z.string().nullable(),
  status: InvoiceStatusSchema,
  invoiceDate: z.iso.date(),
  dueDate: z.iso.date().nullable(),
  currency: CurrencySchema,
  subtotalMinor: z.number().int().nonnegative(),
  taxMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  isFinal: z.boolean(),
  lines: z.array(
    z.object({
      poLineId: z.uuid(),
      quantity: z.number().int().positive(),
      unitPriceMinor: z.number().int().nonnegative(),
      lineTotalMinor: z.number().int().nonnegative(),
    }),
  ),
  createdAt: z.string(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;
export const InvoiceListSchema = z.array(InvoiceSchema);

// FR-404 resolutions: reasons are validated in the service so the API answers
// 422 REASON_REQUIRED (consistent with approvals).
export const ResolutionRequestSchema = z.object({
  reason: z.string().optional(),
});
export type ResolutionRequest = z.infer<typeof ResolutionRequestSchema>;
