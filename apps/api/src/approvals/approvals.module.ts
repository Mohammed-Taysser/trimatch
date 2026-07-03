import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalStep } from './approval-step.model';
import { ChainService } from './chain.service';
import { Delegation } from './delegation.model';
import { DelegationsController } from './delegations.controller';
import { DelegationsService } from './delegations.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { MatrixRule } from './matrix-rule.model';
import { MatrixController } from './matrix.controller';
import { MatrixService } from './matrix.service';

@Module({
  imports: [
    SequelizeModule.forFeature([ApprovalStep, MatrixRule, Delegation]),
    AuditModule,
    NotificationsModule,
  ],
  controllers: [ApprovalsController, MatrixController, DelegationsController],
  providers: [ApprovalsService, MatrixService, ChainService, DelegationsService],
  exports: [MatrixService, ChainService, DelegationsService, ApprovalsService],
})
export class ApprovalsModule {}
