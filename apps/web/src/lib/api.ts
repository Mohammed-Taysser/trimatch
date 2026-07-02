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
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
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
