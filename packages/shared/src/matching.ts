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
});
export type ExceptionsQuery = z.infer<typeof ExceptionsQuerySchema>;
