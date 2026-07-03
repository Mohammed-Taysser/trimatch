import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditEntry } from './audit-entry.model';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [SequelizeModule.forFeature([AuditEntry])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
