import { z } from 'zod';

// No .default()s on purpose: a missing variable must fail the boot loudly so the
// gap is visible to every dev, instead of being masked by a silent fallback.
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    API_PORT: z.coerce.number().int().min(1).max(65535),
    DATABASE_URL: z.string().startsWith('postgres', 'must be a postgres:// connection URL'),
    REDIS_URL: z.string().startsWith('redis', 'must be a redis:// connection URL'),
    JWT_SECRET: z.string().min(16, 'must be at least 16 characters'),
    JWT_EXPIRES_IN: z.string().min(1),
    // Outbound notification delivery (Epic 9). Explicit — no silent default; set
    // `none` to disable out-of-app delivery. `webhook` requires the URL below,
    // so a partial config fails the boot rather than half-enabling the channel.
    NOTIFICATIONS_CHANNEL: z.enum(['none', 'webhook']),
    NOTIFICATIONS_WEBHOOK_URL: z.url().optional(),
    // Rate limiting (Epic 16). Window in milliseconds + max requests per IP per
    // window: a lenient global limit, and a stricter one for credential
    // endpoints (login). All required — no silent defaults.
    THROTTLE_TTL: z.coerce.number().int().positive(),
    THROTTLE_LIMIT: z.coerce.number().int().positive(),
    THROTTLE_AUTH_TTL: z.coerce.number().int().positive(),
    THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive(),
    // Number of reverse-proxy hops in front of the API (Express `trust proxy`,
    // 869dzymvw). Behind the ADR-0005 nginx proxy this is 1, so per-IP rate
    // limiting reads the real client IP from X-Forwarded-For; direct/dev is 0
    // (trust nobody). Required — no silent default.
    TRUST_PROXY: z.coerce.number().int().min(0),
    // Allowed WebSocket CORS origin(s), comma-separated (869dzymvy). The Socket.IO
    // server rejects handshakes from any other browser origin — dev is the Vite
    // origin (http://localhost:5173), prod is the public site origin. Never `*`.
    // Required — no silent default.
    WS_CORS_ORIGIN: z.string().min(1),
    // Default TTL (ms) for the Redis-backed cache (869dzr3k8). A safety-net
    // expiry on top of explicit write-side invalidation. Required — no default.
    CACHE_TTL: z.coerce.number().int().positive(),
    // AES-256-GCM key (32 bytes = 64 hex chars) for encrypting TOTP secrets at
    // rest (869e01b1b) — a secret that must be stored verifiably, not hashed.
    // Generate with `openssl rand -hex 32`. Required — no default.
    TOTP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex chars (32 bytes)'),
  })
  .refine(
    (env) => env.NOTIFICATIONS_CHANNEL !== 'webhook' || Boolean(env.NOTIFICATIONS_WEBHOOK_URL),
    {
      path: ['NOTIFICATIONS_WEBHOOK_URL'],
      message: 'is required when NOTIFICATIONS_CHANNEL=webhook',
    },
  );

export type Env = z.infer<typeof envSchema>;

// Wired into ConfigModule.forRoot({ validate }) — a failed parse aborts bootstrap,
// which is what enforces "the app refuses to boot with invalid env config".
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
