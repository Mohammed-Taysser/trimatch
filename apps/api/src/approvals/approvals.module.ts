import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditModule } from '../audit/audit.module';
import { ApprovalStep } from './approval-step.model';
import { ChainService } from './chain.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { MatrixRule } from './matrix-rule.model';
import { MatrixController } from './matrix.controller';
import { MatrixService } from './matrix.service';

@Module({
  imports: [SequelizeModule.forFeature([ApprovalStep, MatrixRule]), AuditModule],
  controllers: [ApprovalsController, MatrixController],
  providers: [ApprovalsService, MatrixService, ChainService],
  exports: [MatrixService, ChainService],
})
export class ApprovalsModule {}
