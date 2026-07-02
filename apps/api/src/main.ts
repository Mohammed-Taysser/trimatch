import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupApp, setupOpenApi } from './setup-app';

async function bootstrap(): Promise<void> {
  const app = setupApp(await NestFactory.create(AppModule));
  setupOpenApi(app);
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('API_PORT');
  await app.listen(port);
  console.log(`TriMatch API listening on :${port} (prefix /api/v1, docs /api/docs)`);
}

void bootstrap();
