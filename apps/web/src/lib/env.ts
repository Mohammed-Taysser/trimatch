import { z } from 'zod';

// Imported from main.tsx before render — an invalid web env also refuses to boot.
const webEnvSchema = z.object({
  MODE: z.enum(['development', 'test', 'production']),
  // Empty default = same-origin requests, served by the vite proxy in dev.
  VITE_API_BASE_URL: z.string().default(''),
});

export const webEnv = webEnvSchema.parse(import.meta.env);
