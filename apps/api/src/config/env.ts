import { z } from 'zod';

// No .default()s on purpose: a missing variable must fail the boot loudly so the
// gap is visible to every dev, instead of being masked by a silent fallback.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  API_PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().startsWith('postgres', 'must be a postgres:// connection URL'),
  REDIS_URL: z.string().startsWith('redis', 'must be a redis:// connection URL'),
});

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
