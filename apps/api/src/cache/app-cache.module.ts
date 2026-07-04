import { createKeyv } from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Redis-backed cache (869dzr3k8). Global so any provider can inject CACHE_MANAGER
// without importing this module. The store reuses REDIS_URL via Keyv; CACHE_TTL
// is the default safety-net expiry on top of explicit write-side invalidation.
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [createKeyv(config.getOrThrow<string>('REDIS_URL'))],
        ttl: config.getOrThrow<number>('CACHE_TTL'),
      }),
    }),
  ],
})
export class AppCacheModule {}
