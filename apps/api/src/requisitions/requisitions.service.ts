import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import {
  Requisition as RequisitionView,
  RequisitionCreate,
  RequisitionSchema,
  RequisitionUpdate,
  PaginationQuery,
} from '@trimatch/shared';
import { Sequelize } from 'sequelize-typescript';
import { ApprovalStep } from '../approvals/approval-step.model';
import { PagedResult, pageMeta, pageOffset } from '../common/paged';
import { AuditService } from '../audit/audit.service';
import { User } from '../identity/user.model';
import { UsersService } from '../identity/users.service';
import { PurchaseOrder } from '../purchasing/purchase-order.model';
import { requisitionLifecycle } from './requisition.lifecycle';
import { Requisition, RequisitionLine } from './requisition.model';
import { computeTotals } from './requisition.totals';

@Injectable()
export class RequisitionsService {
  constructor(
    @InjectModel(Requisition) private readonly requisitions: typeof Requisition,
    @InjectModel(RequisitionLine) private readonly lines: typeof RequisitionLine,
    @InjectModel(ApprovalStep) private readonly steps: typeof ApprovalStep,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  // FR-103 / TC-104: draft → pending_approval, chain snapshotted (MVP: the
  // requester's manager — ADR-0002), audit row — all in one transaction.
  async submit(id: string, requesterId: string): Promise<RequisitionView> {
    await this.sequelize.transaction(async (transaction) => {
      const row = await this.requisitions.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Requisition not found' });
      }
      if (row.requesterId !== requesterId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only the requester may submit this requisition',
        });
      }
      requisitionLifecycle.assertCanTransition(row.status, 'pending_approval');

      const requester = await this.users.findById(requesterId);
      if (!requester?.managerId) {
        throw new ConflictException({
          code: 'NO_APPROVER',
          message: 'The requester has no manager to approve this requisition',
        });
      }

      const previousRounds = (await this.steps.max('round', {
        where: { requisitionId: id },
        transaction,
      })) as number | null;
      await this.steps.create(
        {
          requisitionId: id,
          round: (previousRounds ?? 0) + 1,
          stepNo: 1,
          approverId: requester.managerId,
          status: 'pending',
        },
        { transaction },
      );
      await row.update({ status: 'pending_approval' }, { transaction });
      await this.audit.record(
        {
          entityType: 'requisition',
          entityId: id,
          actorId: requesterId,
          action: 'requisition.submitted',
          fromState: 'draft',
          toState: 'pending_approval',
        },
        transaction,
      );
    });
    return this.findOwn(id, requesterId);
  }

  async create(requesterId: string, input: RequisitionCreate): Promise<RequisitionView> {
    const totals = computeTotals(input.lines);
    const id = await this.sequelize.transaction(async (transaction) => {
      const requisition = await this.requisitions.create(
        {
          requesterId,
          status: 'draft',
          justification: input.justification,
          neededBy: input.neededBy,
          currency: input.currency,
          totalMinor: totals.totalMinor,
        },
        { transaction },
      );
      await this.lines.bulkCreate(
        totals.lines.map((line) => ({ ...line, requisitionId: requisition.id })),
        { transaction },
      );
      return requisition.id;
    });
    return this.findOwn(id, requesterId);
  }

  // FR-105 / TC-106: rejected → draft; the next submit opens a new round while
  // the decided steps of earlier rounds stay untouched (history kept).
  async revise(id: string, requesterId: string): Promise<RequisitionView> {
    await this.sequelize.transaction(async (transaction) => {
      const row = await this.requisitions.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Requisition not found' });
      }
      if (row.requesterId !== requesterId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only the requester may revise this requisition',
        });
      }
      requisitionLifecycle.assertCanTransition(row.status, 'draft');
      await row.update({ status: 'draft' }, { transaction });
      await this.audit.record(
        {
          entityType: 'requisition',
          entityId: id,
          actorId: requesterId,
          action: 'requisition.revised',
          fromState: 'rejected',
          toState: 'draft',
        },
        transaction,
      );
    });
    return this.findOwn(id, requesterId);
  }

  // Purchasing queue (FR-201): approved requisitions awaiting conversion.
  async findApproved(query: PaginationQuery): Promise<PagedResult<RequisitionView>> {
    const { rows, count } = await this.requisitions.findAndCountAll({
      where: { status: 'approved' },
      include: [RequisitionLine, { model: ApprovalStep, include: [User] }, User],
      order: [['updatedAt', 'ASC']],
      distinct: true,
      ...pageOffset(query),
    });
    return new PagedResult(
      rows.map((row) => this.toView(row)),
      pageMeta(query, count),
    );
  }

  async findAllOwn(
    requesterId: string,
    query: PaginationQuery,
  ): Promise<PagedResult<RequisitionView>> {
    const { rows, count } = await this.requisitions.findAndCountAll({
      where: { requesterId },
      include: [RequisitionLine, { model: ApprovalStep, include: [User] }, PurchaseOrder],
      order: [
        ['createdAt', 'DESC'],
        [{ model: RequisitionLine, as: 'lines' }, 'lineNo', 'ASC'],
      ],
      distinct: true,
      ...pageOffset(query),
    });
    return new PagedResult(
      rows.map((row) => this.toView(row)),
      pageMeta(query, count),
    );
  }

  async findOwn(id: string, requesterId: string): Promise<RequisitionView> {
    const row = await this.requisitions.findByPk(id, {
      include: [RequisitionLine, { model: ApprovalStep, include: [User] }, PurchaseOrder],
    });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Requisition not found' });
    }
    if (row.requesterId !== requesterId) {
      // FR-102: a draft belongs to its requester — anyone else is forbidden.
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only the requester may access this requisition',
      });
    }
    return this.toView(row);
  }

  async update(
    id: string,
    requesterId: string,
    input: RequisitionUpdate,
  ): Promise<RequisitionView> {
    await this.assertOwnedDraft(id, requesterId);
    const totals = computeTotals(input.lines);
    await this.sequelize.transaction(async (transaction) => {
      await this.requisitions.update(
        {
          justification: input.justification,
          neededBy: input.neededBy,
          currency: input.currency,
          totalMinor: totals.totalMinor,
        },
        { where: { id }, transaction },
      );
      await this.lines.destroy({ where: { requisitionId: id }, transaction });
      await this.lines.bulkCreate(
        totals.lines.map((line) => ({ ...line, requisitionId: id })),
        { transaction },
      );
    });
    return this.findOwn(id, requesterId);
  }

  async remove(id: string, requesterId: string): Promise<void> {
    await this.assertOwnedDraft(id, requesterId);
    await this.requisitions.destroy({ where: { id } });
  }

  private async assertOwnedDraft(id: string, requesterId: string): Promise<Requisition> {
    const row = await this.requisitions.findByPk(id);
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Requisition not found' });
    }
    if (row.requesterId !== requesterId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only the requester may edit or delete this requisition',
      });
    }
    if (row.status !== 'draft') {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: 'Only draft requisitions can be edited or deleted',
      });
    }
    return row;
  }

  private toView(row: Requisition): RequisitionView {
    return RequisitionSchema.parse({
      id: row.id,
      requesterId: row.requesterId,
      requesterName: row.requester?.fullName,
      status: row.status,
      justification: row.justification,
      neededBy: row.neededBy,
      currency: row.currency,
      totalMinor: Number(row.totalMinor),
      lines: (row.lines ?? [])
        .slice()
        .sort((a, b) => a.lineNo - b.lineNo)
        .map((line) => ({
          id: line.id,
          lineNo: line.lineNo,
          description: line.description,
          category: line.category,
          quantity: line.quantity,
          unitPriceMinor: Number(line.unitPriceMinor),
          lineTotalMinor: Number(line.lineTotalMinor),
        })),
      steps: (row.steps ?? [])
        .slice()
        .sort((a, b) => a.round - b.round || a.stepNo - b.stepNo)
        .map((step) => ({
          id: step.id,
          round: step.round,
          stepNo: step.stepNo,
          status: step.status,
          approverId: step.approverId,
          approverName: step.approver?.fullName ?? 'Unknown',
          reason: step.reason,
          decidedAt: step.decidedAt ? step.decidedAt.toISOString() : null,
        })),
      po: row.po ? { id: row.po.id, poNumber: row.po.poNumber, status: row.po.status } : null,
      createdAt: (row.createdAt as Date).toISOString(),
      updatedAt: (row.updatedAt as Date).toISOString(),
    });
  }
}
