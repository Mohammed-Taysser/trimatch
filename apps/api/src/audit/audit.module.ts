import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditEntry } from './audit-entry.model';
import { AuditService } from './audit.service';

@Module({
  imports: [SequelizeModule.forFeature([AuditEntry])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
