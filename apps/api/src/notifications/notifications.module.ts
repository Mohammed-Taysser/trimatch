import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { NotificationsProcessor } from './notifications.processor';
import { QueueHealth } from './queue-health.service';

// BullMQ foundation (ADR-0001): the Redis connection is parsed from the
// existing REDIS_URL env (no new config); the notifications queue + worker are
// what later hand-offs and the outbound channel build on.
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('REDIS_URL'));
        return { connection: { host: url.hostname, port: Number(url.port) || 6379 } };
      },
    }),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
  ],
  providers: [NotificationsProcessor, QueueHealth],
  exports: [QueueHealth, BullModule],
})
export class NotificationsModule {}
