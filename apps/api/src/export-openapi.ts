import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { setupApp, setupOpenApi } from './setup-app';

// pnpm --filter @trimatch/api openapi:export → docs/api/openapi.json
// (generated artifact, untracked; published from CI — ADR-0003).
async function main(): Promise<void> {
  const app = setupApp(await NestFactory.create(AppModule, { logger: false }));
  const document = setupOpenApi(app);
  await app.init();
  const outDir = resolve(__dirname, '../../../docs/api');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'openapi.json'), JSON.stringify(document, null, 2));
  await app.close();
  console.log(`OpenAPI exported to ${resolve(outDir, 'openapi.json')}`);
}

void main();
