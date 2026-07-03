import { z } from 'zod';

// In-app notifications (Epic 9). A notification's type IS the domain event that
// triggered it — this enum is the canonical event contract from
// docs/03-domain.md §5, which the emit-on-hand-offs task fires at each hand-off.
export const NotificationTypeSchema = z.enum([
  'requisition.submitted',
  'requisition.approved',
  'requisition.rejected',
  'po.issued',
  'po.received',
  'grn.recorded',
  'invoice.entered',
  'invoice.matched',
  'invoice.exception',
  'invoice.payable',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

// The entity a notification points back to (for deep-linking in the web center).
export const NotificationEntityTypeSchema = z.enum([
  'requisition',
  'purchase_order',
  'goods_receipt',
  'invoice',
  'match',
]);
export type NotificationEntityType = z.infer<typeof NotificationEntityTypeSchema>;

export const NotificationSchema = z.object({
  id: z.uuid(),
  recipientId: z.uuid(),
  type: NotificationTypeSchema,
  entityType: NotificationEntityTypeSchema.nullable(),
  entityId: z.uuid().nullable(),
  message: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationListSchema = z.array(NotificationSchema);

// GET /notifications — paginated, optional unread-only filter.
export const NotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  // Query params arrive as strings; accept only the two explicit values so a
  // typo fails loudly instead of silently coercing to `true`.
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type NotificationsQuery = z.infer<typeof NotificationsQuerySchema>;

// The payload enqueued on the notifications queue; the worker validates this
// and persists a row. The emit-on-hand-offs task produces these jobs.
export const NotificationJobSchema = z.object({
  recipientId: z.uuid(),
  type: NotificationTypeSchema,
  message: z.string().min(1),
  entityType: NotificationEntityTypeSchema.optional(),
  entityId: z.uuid().optional(),
});
export type NotificationJob = z.infer<typeof NotificationJobSchema>;
