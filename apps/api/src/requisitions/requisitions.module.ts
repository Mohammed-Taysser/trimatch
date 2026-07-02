import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { ApprovalStep } from './approval-step.model';
import { Requisition, RequisitionLine } from './requisition.model';
import { RequisitionsController } from './requisitions.controller';
import { RequisitionsService } from './requisitions.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Requisition, RequisitionLine, ApprovalStep]),
    IdentityModule,
    AuditModule,
  ],
  controllers: [RequisitionsController],
  providers: [RequisitionsService],
})
export class RequisitionsModule {}
