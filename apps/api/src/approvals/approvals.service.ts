import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { InboxItem, InboxSchema, PaginationQuery } from '@trimatch/shared';
import { literal, Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import { DelegationsService } from './delegations.service';
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
    private readonly delegations: DelegationsService,
  ) {}

  async inbox(approverId: string, query: PaginationQuery): Promise<PagedResult<InboxItem>> {
    // FR-502: an approver sees a step only when it is their turn — the
    // lowest pending step_no of the requisition's current round, and only
    // while the requisition is still pending approval.
    // FR-503: an active delegation lets the delegate work the delegator's queue.
    const delegators = await this.delegations.activeDelegatorsFor(approverId);
    const { rows, count } = await this.steps.findAndCountAll({
      where: {
        approverId: { [Op.in]: [approverId, ...delegators] },
        status: 'pending',
        [Op.and]: [
          literal(`"ApprovalStep"."step_no" = (
            SELECT MIN(s2.step_no) FROM approval_steps s2
            WHERE s2.requisition_id = "ApprovalStep"."requisition_id"
              AND s2.round = "ApprovalStep"."round" AND s2.status = 'pending')`),
          literal(`"ApprovalStep"."round" = (
            SELECT MAX(s3.round) FROM approval_steps s3
            WHERE s3.requisition_id = "ApprovalStep"."requisition_id")`),
        ],
      },
      include: [{ model: Requisition, include: [User], where: { status: 'pending_approval' } }],
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
      let onBehalfOf: string | null = null;
      if (step.approverId !== approverId) {
        const delegation = await this.delegations.activeDelegation(step.approverId, approverId);
        if (!delegation) {
          throw new ForbiddenException({
            code: 'FORBIDDEN',
            message: 'This approval step is assigned to another approver',
          });
        }
        // FR-503 / TC-504: the audit row must show both identities.
        onBehalfOf = `on behalf of ${delegation.delegator?.fullName ?? step.approverId} (delegation ${delegation.id})`;
      }
      if (step.status !== 'pending') {
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: 'This approval step has already been decided',
        });
      }
      // FR-502: steps execute strictly in order.
      const earlier = await this.steps.count({
        where: {
          requisitionId: step.requisitionId,
          round: step.round,
          status: 'pending',
          stepNo: { [Op.lt]: step.stepNo },
        },
        transaction,
      });
      if (earlier > 0) {
        throw new ConflictException({
          code: 'STEP_NOT_CURRENT',
          message: 'An earlier step in this approval chain is still pending',
        });
      }

      await step.update(
        { status: decision, reason: trimmedReason ?? null, decidedAt: new Date() },
        { transaction },
      );
      await this.advanceRequisition(
        step,
        decision,
        approverId,
        trimmedReason,
        transaction,
        onBehalfOf,
      );
    });
  }

  private async advanceRequisition(
    step: ApprovalStep,
    decision: 'approved' | 'rejected',
    approverId: string,
    reason: string | undefined,
    transaction: Transaction,
    onBehalfOf: string | null = null,
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
        comment: [reason, onBehalfOf].filter(Boolean).join(' — ') || undefined,
      },
      transaction,
    );
  }
}
