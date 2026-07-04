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
