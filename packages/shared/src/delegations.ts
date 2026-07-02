import { z } from 'zod';

export const DelegationCreateSchema = z.object({
  delegateEmail: z.string().min(3),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});
export type DelegationCreate = z.infer<typeof DelegationCreateSchema>;

export const DelegationSchema = z.object({
  id: z.uuid(),
  delegatorId: z.uuid(),
  delegatorName: z.string(),
  delegateId: z.uuid(),
  delegateName: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  createdAt: z.string(),
});
export type Delegation = z.infer<typeof DelegationSchema>;
export const DelegationListSchema = z.array(DelegationSchema);
