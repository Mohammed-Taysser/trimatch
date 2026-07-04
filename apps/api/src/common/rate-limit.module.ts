import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ExecutionContext, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { SENSITIVE_THROTTLE } from './sensitive-throttle.decorator';

// Rate limiting (Epic 16). A lenient global limit on every route plus a stricter
// "auth" limit that — via skipIf + the @SensitiveThrottle marker — applies ONLY
// to credential endpoints. Limits come from env (fail-loud); storage is Redis so
// counters are shared across instances (reuses REDIS_URL).
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const reflector = new Reflector();
        const isSensitive = (context: ExecutionContext): boolean =>
          reflector.get<boolean>(SENSITIVE_THROTTLE, context.getHandler()) === true;
        return {
          errorMessage: 'Too many requests — please slow down and try again shortly.',
          storage: new ThrottlerStorageRedisService(config.getOrThrow<string>('REDIS_URL')),
          throttlers: [
            {
              name: 'global',
              ttl: config.getOrThrow<number>('THROTTLE_TTL'),
              limit: config.getOrThrow<number>('THROTTLE_LIMIT'),
            },
            {
              name: 'auth',
              ttl: config.getOrThrow<number>('THROTTLE_AUTH_TTL'),
              limit: config.getOrThrow<number>('THROTTLE_AUTH_LIMIT'),
              skipIf: (context) => !isSensitive(context),
            },
          ],
        };
      },
    }),
  ],
})
export class RateLimitModule {}
