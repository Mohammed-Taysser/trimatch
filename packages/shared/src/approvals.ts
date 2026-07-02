import { z } from 'zod';
import { CurrencySchema } from './requisitions';

// One pending item in an approver's inbox.
export const InboxItemSchema = z.object({
  stepId: z.uuid(),
  round: z.number().int().positive(),
  stepNo: z.number().int().positive(),
  requisition: z.object({
    id: z.uuid(),
    justification: z.string(),
    currency: CurrencySchema,
    totalMinor: z.number().int().nonnegative(),
    neededBy: z.iso.date(),
    requesterName: z.string(),
    createdAt: z.string(),
  }),
});
export type InboxItem = z.infer<typeof InboxItemSchema>;
export const InboxSchema = z.array(InboxItemSchema);

// Reason is validated in the service so the API answers 422 REASON_REQUIRED
// (TC-105) rather than the generic VALIDATION_ERROR.
export const RejectRequestSchema = z.object({
  reason: z.string().optional(),
});
export type RejectRequest = z.infer<typeof RejectRequestSchema>;
