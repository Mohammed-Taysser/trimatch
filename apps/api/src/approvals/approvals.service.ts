import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { InboxItem, InboxSchema, PaginationQuery } from '@trimatch/shared';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import { PagedResult, pageMeta, pageOffset } from '../common/paged';
import { User } from '../identity/user.model';
import { requisitionLifecycle } from '../requisitions/requisition.lifecycle';
import { Requisition } from '../requisitions/requisition.model';
import { ApprovalStep } from './approval-step.model';

@Injectable()
export class ApprovalsService {
  constructor(
    @InjectModel(ApprovalStep) private readonly steps: typeof ApprovalStep,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly audit: AuditService,
  ) {}

  async inbox(approverId: string, query: PaginationQuery): Promise<PagedResult<InboxItem>> {
    const { rows, count } = await this.steps.findAndCountAll({
      where: { approverId, status: 'pending' },
      include: [{ model: Requisition, include: [User] }],
      order: [['createdAt', 'ASC']],
      distinct: true,
      ...pageOffset(query),
    });
    const items = InboxSchema.parse(
      rows.flatMap((step) => {
        const requisition = step.requisition;
        if (!requisition) return [];
        return [
          {
            stepId: step.id,
            round: step.round,
            stepNo: step.stepNo,
            requisition: {
              id: requisition.id,
              justification: requisition.justification,
              currency: requisition.currency,
              totalMinor: Number(requisition.totalMinor),
              neededBy: requisition.neededBy,
              requesterName: requisition.requester?.fullName ?? 'Unknown',
              createdAt: (requisition.createdAt as Date).toISOString(),
            },
          },
        ];
      }),
    );
    return new PagedResult(items, pageMeta(query, count));
  }

  // FR-104: approve advances the requisition (next step or approved);
  // reject requires a reason (TC-105) and rejects the requisition.
  async decide(
    stepId: string,
    approverId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): Promise<void> {
    const trimmedReason = reason?.trim();
    if (decision === 'rejected' && !trimmedReason) {
      throw new UnprocessableEntityException({
        code: 'REASON_REQUIRED',
        message: 'A reason is mandatory when rejecting',
      });
    }

    await this.sequelize.transaction(async (transaction) => {
      const step = await this.steps.findByPk(stepId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!step) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Approval step not found' });
      }
      if (step.approverId !== approverId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'This approval step is assigned to another approver',
        });
      }
      if (step.status !== 'pending') {
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: 'This approval step has already been decided',
        });
      }

      await step.update(
        { status: decision, reason: trimmedReason ?? null, decidedAt: new Date() },
        { transaction },
      );
      await this.advanceRequisition(step, decision, approverId, trimmedReason, transaction);
    });
  }

  private async advanceRequisition(
    step: ApprovalStep,
    decision: 'approved' | 'rejected',
    approverId: string,
    reason: string | undefined,
    transaction: Transaction,
  ): Promise<void> {
    const requisition = await Requisition.findByPk(step.requisitionId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!requisition) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Requisition not found' });
    }

    let target: 'approved' | 'rejected' | null = null;
    if (decision === 'rejected') {
      target = 'rejected';
    } else {
      const remaining = await this.steps.count({
        where: { requisitionId: step.requisitionId, round: step.round, status: 'pending' },
        transaction,
      });
      if (remaining === 0) target = 'approved';
    }
    if (!target) return; // more steps pending in this round

    requisitionLifecycle.assertCanTransition(requisition.status, target);
    await requisition.update({ status: target }, { transaction });
    await this.audit.record(
      {
        entityType: 'requisition',
        entityId: requisition.id,
        actorId: approverId,
        action: `requisition.${target}`,
        fromState: 'pending_approval',
        toState: target,
        comment: reason,
      },
      transaction,
    );
  }
}
