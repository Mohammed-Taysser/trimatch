import { z } from 'zod';

export const MatchReasonCodeSchema = z.enum([
  'PRICE_VARIANCE',
  'QTY_OVER_INVOICED',
  'QTY_UNDER_DELIVERY',
  'TOTAL_VARIANCE',
]);
export type MatchReasonCode = z.infer<typeof MatchReasonCodeSchema>;

export const MatchRecordSchema = z.object({
  id: z.uuid(),
  invoiceId: z.uuid(),
  outcome: z.enum(['matched', 'exception']),
  tolerances: z.object({
    priceToleranceBp: z.number().int(),
    qtyUnderDeliveryBp: z.number().int(),
    totalToleranceAbsMinor: z.number().int(),
  }),
  comparisons: z.array(
    z.object({
      poLineId: z.uuid(),
      lineNo: z.number().int(),
      orderedQty: z.number().int(),
      receivedQty: z.number().int(),
      cumulativeInvoicedQty: z.number().int(),
      poUnitPriceMinor: z.number().int(),
      invoiceUnitPriceMinor: z.number().int(),
      priceDeltaBp: z.number().int(),
      verdict: z.union([z.literal('ok'), MatchReasonCodeSchema]),
    }),
  ),
  reasons: z.array(
    z.object({
      code: MatchReasonCodeSchema,
      lineNo: z.number().int().nullable(),
      detail: z.string(),
    }),
  ),
  expectedTotalMinor: z.number().int(),
  totalDeltaMinor: z.number().int(),
  createdAt: z.string(),
});
export type MatchRecord = z.infer<typeof MatchRecordSchema>;

export const ExceptionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  vendorId: z.uuid().optional(),
  reason: MatchReasonCodeSchema.optional(),
  olderThanDays: z.coerce.number().int().nonnegative().optional(),
  // FR-603: the queue is a worklist — oldest first by default.
  sort: z.enum(['oldest', 'newest', 'vendor', 'reason']).default('oldest'),
});
export type ExceptionsQuery = z.infer<typeof ExceptionsQuerySchema>;

// FR-603: counts per reason for the queue header — an invoice carrying two
// reasons counts toward both, so the sum can exceed total.
export const ExceptionsSummaryQuerySchema = z.object({
  vendorId: z.uuid().optional(),
  olderThanDays: z.coerce.number().int().nonnegative().optional(),
});
export type ExceptionsSummaryQuery = z.infer<typeof ExceptionsSummaryQuerySchema>;
export const ExceptionsSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  counts: z.array(z.object({ reason: MatchReasonCodeSchema, count: z.number().int().positive() })),
});
export type ExceptionsSummary = z.infer<typeof ExceptionsSummarySchema>;
