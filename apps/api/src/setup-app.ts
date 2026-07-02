import { INestApplication } from '@nestjs/common';

// Shared between main.ts and e2e tests so both serve the same /api/v1 surface.
export function setupApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api/v1');
  return app;
}
