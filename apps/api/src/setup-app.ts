import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';

// Shared between main.ts, the openapi export script and tests so they all
// serve the same /api/v1 surface and /api/docs contract.
export function setupApp(app: INestApplication): INestApplication {
  // Security headers (Epic 16). CSP is disabled: this is a JSON API and the
  // default `default-src 'self'` would break the Swagger UI at /api/docs; the
  // headers that matter for an API (nosniff, frame, HSTS, referrer) stay on.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.setGlobalPrefix('api/v1');
  return app;
}

// Express `trust proxy` (869dzymvw). Behind the ADR-0005 nginx reverse proxy the
// socket IP is the proxy's, so per-IP rate limiting must read the real client
// from X-Forwarded-For — `hops` is how many proxies to trust (1 for nginx, 0 to
// trust none). Applied from bootstrap only; tests/openapi hit the app directly.
export function applyTrustProxy(app: INestApplication, hops: number): void {
  app.getHttpAdapter().getInstance().set('trust proxy', hops);
}

export function setupOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('TriMatch API')
    .setDescription('Enterprise procurement with 3-way matching')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
  return document;
}
