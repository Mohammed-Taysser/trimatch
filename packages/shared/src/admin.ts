import { z } from 'zod';
import { UserRoleSchema } from './auth';
import { RequisitionStatusSchema } from './requisitions';

// Superadmin dashboard (Epic 7): user management + the read-only audit
// browser. Every endpoint behind these schemas is @Roles('admin') — the
// dashboard never bypasses business rules, it reuses them.

export const UserAdminSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string(),
  role: UserRoleSchema,
  managerId: z.uuid().nullable(),
  managerName: z.string().nullable(),
  department: z.string().nullable(),
  jobTitle: z.string().nullable(),
  // ADR-0007: deactivated users keep every historical record but cannot log in
  // or be assigned as approvers.
  active: z.boolean(),
});
export type UserAdmin = z.infer<typeof UserAdminSchema>;
export const UserAdminListSchema = z.array(UserAdminSchema);

export const UserUpdateSchema = z
  .object({
    role: UserRoleSchema.optional(),
    managerId: z.uuid().nullable().optional(),
    // ADR-0007: soft-delete/offboarding — false deactivates, true reactivates.
    active: z.boolean().optional(),
  })
  .refine(
    (update) =>
      update.role !== undefined || update.managerId !== undefined || update.active !== undefined,
    { message: 'change the role, the manager, the active flag, or a combination' },
  );
export type UserUpdate = z.infer<typeof UserUpdateSchema>;

export const AuditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  entityType: z.string().min(1).max(50).optional(),
  entityId: z.uuid().optional(),
  actorId: z.uuid().optional(),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export const AuditEntrySchema = z.object({
  id: z.uuid(),
  entityType: z.string(),
  entityId: z.uuid(),
  actorId: z.uuid(),
  actorName: z.string(),
  action: z.string(),
  fromState: z.string().nullable(),
  toState: z.string().nullable(),
  comment: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export const AuditListSchema = z.array(AuditEntrySchema);

export const RequisitionsAllQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: RequisitionStatusSchema.optional(),
});
export type RequisitionsAllQuery = z.infer<typeof RequisitionsAllQuerySchema>;
