import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Notification } from './notification.model';
import { NOTIFICATIONS_DIGEST_QUEUE } from './notifications-digest.constants';
import { NotificationsDigestProcessor } from './notifications-digest.processor';
import { NotificationsDigestScheduler } from './notifications-digest.scheduler';
import { NotificationsDigestService } from './notifications-digest.service';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsProducer } from './notifications.producer';
import { NotificationsService } from './notifications.service';
import { outboundChannelProvider } from './outbound/outbound-channel.provider';
import { QueueHealth } from './queue-health.service';

// BullMQ foundation (ADR-0001): the Redis connection is parsed from the
// existing REDIS_URL env (no new config). The queue worker persists per-user
// notifications via NotificationsService; the controller exposes them.
@Module({
  imports: [
    SequelizeModule.forFeature([Notification]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('REDIS_URL'));
        return { connection: { host: url.hostname, port: Number(url.port) || 6379 } };
      },
    }),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
    BullModule.registerQueue({ name: NOTIFICATIONS_DIGEST_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsProcessor,
    NotificationsService,
    NotificationsProducer,
    QueueHealth,
    outboundChannelProvider,
    NotificationsDigestService,
    NotificationsDigestProcessor,
    NotificationsDigestScheduler,
  ],
  exports: [
    QueueHealth,
    NotificationsService,
    NotificationsProducer,
    NotificationsDigestService,
    BullModule,
  ],
})
export class NotificationsModule {}
