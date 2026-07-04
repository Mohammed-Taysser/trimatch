import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { NotificationsModule } from '../notifications/notifications.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  // TerminusModule provides the SequelizeHealthIndicator used for the real DB
  // ping; NotificationsModule provides QueueHealth (Redis + queue readiness).
  imports: [TerminusModule, NotificationsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
