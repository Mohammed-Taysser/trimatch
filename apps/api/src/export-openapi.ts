import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { setupApp, setupOpenApi } from './setup-app';

// pnpm --filter @trimatch/api openapi:export → docs/api/openapi.json
// (generated artifact, untracked; published from CI — ADR-0003).
async function main(): Promise<void> {
  // Preview mode builds the module graph and route metadata WITHOUT instantiating
  // providers or opening DB/Redis connections — all the OpenAPI scan needs, and it
  // lets the CI build job export the spec without database services.
  const app = setupApp(await NestFactory.create(AppModule, { logger: false, preview: true }));
  const document = setupOpenApi(app);
  const outDir = resolve(__dirname, '../../../docs/api');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'openapi.json'), JSON.stringify(document, null, 2));
  await app.close();
  console.log(`OpenAPI exported to ${resolve(outDir, 'openapi.json')}`);
}

void main();
