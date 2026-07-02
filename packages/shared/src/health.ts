import { z } from 'zod';

export const HealthLivenessSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('trimatch-api'),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string(),
});
export type HealthLiveness = z.infer<typeof HealthLivenessSchema>;

export const HealthReadinessSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    postgres: z.boolean(),
    redis: z.boolean(),
  }),
});
export type HealthReadiness = z.infer<typeof HealthReadinessSchema>;
