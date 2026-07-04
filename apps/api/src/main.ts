import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './notifications/redis-io.adapter';
import { setupApp, setupOpenApi } from './setup-app';

async function bootstrap(): Promise<void> {
  const app = setupApp(await NestFactory.create(AppModule, { bufferLogs: true }));
  app.useLogger(app.get(Logger));
  setupOpenApi(app);
  const config = app.get(ConfigService);
  // Real-time notifications: back Socket.IO with the Redis adapter for
  // cross-instance fan-out (reuses REDIS_URL).
  const wsAdapter = new RedisIoAdapter(app);
  await wsAdapter.connectToRedis(config.getOrThrow<string>('REDIS_URL'));
  app.useWebSocketAdapter(wsAdapter);
  const port = config.getOrThrow<number>('API_PORT');
  await app.listen(port);
  console.log(`TriMatch API listening on :${port} (prefix /api/v1, docs /api/docs)`);
}

void bootstrap();
