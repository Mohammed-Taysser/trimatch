import { PageMeta, PageMetaSchema } from '@trimatch/shared';
import { ZodType } from 'zod';
import { webEnv } from './env';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

interface ApiOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  schema?: ZodType<T>;
}

export async function apiFetch<T = unknown>(path: string, opts: ApiOptions<T> = {}): Promise<T> {
  const res = await fetch(`${webEnv.VITE_API_BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json as { code?: string; message?: string };
    throw new ApiError(err.code ?? 'UNKNOWN', err.message ?? res.statusText, res.status);
  }
  // Fixed envelope: successes are { data, meta?, message, timestamp, requestId }.
  const payload = (json as { data?: unknown }).data;
  return opts.schema ? opts.schema.parse(payload) : (payload as T);
}

// Paginated lists carry { data, meta } — this keeps the meta so screens can
// render pagination controls (story 869dz698b).
export async function apiFetchPaged<T>(
  path: string,
  opts: { token?: string | null; schema: ZodType<T> },
): Promise<{ items: T; meta: PageMeta }> {
  const res = await fetch(`${webEnv.VITE_API_BASE_URL}${path}`, {
    headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json as { code?: string; message?: string };
    throw new ApiError(err.code ?? 'UNKNOWN', err.message ?? res.statusText, res.status);
  }
  const envelope = json as { data?: unknown; meta?: unknown };
  return { items: opts.schema.parse(envelope.data), meta: PageMetaSchema.parse(envelope.meta) };
}
