import { z } from 'zod';

export const GrnCreateSchema = z.object({
  poId: z.uuid(),
  note: z.string().max(500).optional(),
  lines: z
    .array(
      z.object({
        poLineId: z.uuid(),
        quantity: z.number().int().positive(),
        // FR-304: damaged units are recorded but never count as received.
        damagedQuantity: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1, 'at least one line is required'),
});
export type GrnCreate = z.infer<typeof GrnCreateSchema>;

export const GrnSchema = z.object({
  id: z.uuid(),
  grnNumber: z.string(),
  poId: z.uuid(),
  receivedByName: z.string(),
  note: z.string().nullable(),
  lines: z.array(
    z.object({
      poLineId: z.uuid(),
      quantity: z.number().int().positive(),
      damagedQuantity: z.number().int().nonnegative(),
    }),
  ),
  createdAt: z.string(),
});
export type Grn = z.infer<typeof GrnSchema>;
export const GrnListSchema = z.array(GrnSchema);

// FR-601: receipt history — every GRN recorded against one purchase order.
export const GrnListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  poId: z.uuid(),
});
export type GrnListQuery = z.infer<typeof GrnListQuerySchema>;
