import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditModule } from '../audit/audit.module';
import { Setting } from './setting.model';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

// DB-backed settings (869e01dmv). Exports SettingsService so consumers (auth,
// notifications) can resolve company policies and per-user preferences.
@Module({
  imports: [SequelizeModule.forFeature([Setting]), AuditModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
