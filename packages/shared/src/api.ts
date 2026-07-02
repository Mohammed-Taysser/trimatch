import { z } from 'zod';

// Fixed response envelope — every success response is
// { data, meta?, message, timestamp, requestId }; errors are
// { code, message, details?, timestamp, requestId, path }.
export const PageMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type PageMeta = z.infer<typeof PageMetaSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export function envelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({
    data,
    meta: PageMetaSchema.optional(),
    message: z.string().nullable(),
    timestamp: z.string(),
    requestId: z.string(),
  });
}

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  timestamp: z.string(),
  requestId: z.string(),
  path: z.string(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}
