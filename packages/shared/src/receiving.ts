import { z } from 'zod';

export const GrnCreateSchema = z.object({
  poId: z.uuid(),
  note: z.string().max(500).optional(),
  lines: z
    .array(
      z.object({
        poLineId: z.uuid(),
        quantity: z.number().int().positive(),
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
    }),
  ),
  createdAt: z.string(),
});
export type Grn = z.infer<typeof GrnSchema>;
export const GrnListSchema = z.array(GrnSchema);
