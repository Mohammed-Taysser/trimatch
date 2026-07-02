import { z } from 'zod';

export const MatrixRuleKindSchema = z.enum(['base', 'append']);

// A matrix rule (ADR-0002): amounts in minor units; null department/category
// means "any"; base rules carry the amount-range chain, append rules add
// approvers on top (e.g. R5: CISO for IT / Software licenses).
export const MatrixRuleInputSchema = z.object({
  ruleLabel: z.string().min(1).max(10),
  kind: MatrixRuleKindSchema,
  minAmountMinor: z.number().int().nonnegative().nullable(),
  maxAmountMinor: z.number().int().positive().nullable(),
  department: z.string().min(1).max(100).nullable(),
  category: z.string().min(1).max(100).nullable(),
  chain: z.array(z.string().min(1)).min(1),
});
export type MatrixRuleInput = z.infer<typeof MatrixRuleInputSchema>;

export const MatrixRulesetCreateSchema = z.object({
  rules: z.array(MatrixRuleInputSchema).min(1),
});
export type MatrixRulesetCreate = z.infer<typeof MatrixRulesetCreateSchema>;

export const MatrixRuleSchema = MatrixRuleInputSchema.extend({
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: z.string(),
});
export type MatrixRule = z.infer<typeof MatrixRuleSchema>;
export const MatrixRulesetSchema = z.object({
  version: z.number().int().nonnegative(),
  rules: z.array(MatrixRuleSchema),
});
export type MatrixRuleset = z.infer<typeof MatrixRulesetSchema>;
