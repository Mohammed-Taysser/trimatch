import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ApprovalStep } from '../approvals/approval-step.model';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Requisition, RequisitionLine } from './requisition.model';
import { RequisitionsController } from './requisitions.controller';
import { RequisitionsService } from './requisitions.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Requisition, RequisitionLine, ApprovalStep]),
    IdentityModule,
    AuditModule,
    ApprovalsModule,
    NotificationsModule,
  ],
  controllers: [RequisitionsController],
  providers: [RequisitionsService],
})
export class RequisitionsModule {}
