import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import {
  PaginationQuery,
  PoAmend,
  PoListQuery,
  PoLineInput,
  PoVersion,
  PoVersionSchema,
  PurchaseOrder as PoView,
  PurchaseOrderSchema,
} from '@trimatch/shared';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { PagedResult, pageMeta, pageOffset } from '../common/paged';
import { formatDocNumber, SequencesService } from '../common/sequences.service';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { requisitionLifecycle } from '../requisitions/requisition.lifecycle';
import { Requisition, RequisitionLine } from '../requisitions/requisition.model';
import { computeTotals } from '../requisitions/requisition.totals';
import { Vendor } from '../vendors/vendor.model';
import { VendorsService } from '../vendors/vendors.service';
import { poLifecycle } from './po.lifecycle';
import { PoAmendment, PoLine, PoVersionSnapshot, PurchaseOrder } from './purchase-order.model';

@Injectable()
export class PurchasingService {
  constructor(
    @InjectModel(PurchaseOrder) private readonly orders: typeof PurchaseOrder,
    @InjectModel(PoLine) private readonly lines: typeof PoLine,
    @InjectModel(PoAmendment) private readonly amendments: typeof PoAmendment,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly vendors: VendorsService,
    private readonly audit: AuditService,
    private readonly sequences: SequencesService,
    private readonly approvals: ApprovalsService,
    private readonly notifications: NotificationsProducer,
  ) {}

  // FR-203 / I-6 / TC-203: draft → issued claims PO-YYYY-NNNN inside the same
  // transaction — gapless per year, safe under concurrency.
  async issue(id: string, actorId: string): Promise<PoView> {
    await this.sequelize.transaction(async (transaction) => {
      const po = await this.orders.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!po) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found' });
      }
      poLifecycle.assertCanTransition(po.status, 'issued');
      const year = new Date().getUTCFullYear();
      const sequence = await this.sequences.claim('PO', year, transaction);
      const poNumber = formatDocNumber('PO', year, sequence);
      await po.update({ status: 'issued', poNumber }, { transaction });
      await this.audit.record(
        {
          entityType: 'purchase_order',
          entityId: id,
          actorId,
          action: 'po.issued',
          fromState: 'draft',
          toState: 'issued',
          comment: poNumber,
        },
        transaction,
      );
    });
    return this.findOne(id);
  }

  // FR-201 / TC-201: approved REQ → converted; a PO draft for exactly one
  // vendor inherits the requisition lines — one atomic transaction.
  async convert(requisitionId: string, vendorId: string, actorId: string): Promise<PoView> {
    const vendor = await this.vendors.assertActive(vendorId);
    const poId = await this.sequelize.transaction(async (transaction) => {
      const requisition = await Requisition.findByPk(requisitionId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!requisition) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Requisition not found' });
      }
      requisitionLifecycle.assertCanTransition(requisition.status, 'converted');

      const reqLines = await RequisitionLine.findAll({
        where: { requisitionId },
        order: [['lineNo', 'ASC']],
        transaction,
      });
      const po = await this.orders.create(
        {
          status: 'draft',
          vendorId: vendor.id,
          requisitionId,
          currency: requisition.currency,
          totalMinor: Number(requisition.totalMinor),
          createdBy: actorId,
        },
        { transaction },
      );
      await this.lines.bulkCreate(
        reqLines.map((line) => ({
          poId: po.id,
          lineNo: line.lineNo,
          description: line.description,
          category: line.category,
          vendorSku: null,
          quantity: line.quantity,
          unitPriceMinor: Number(line.unitPriceMinor),
          lineTotalMinor: Number(line.lineTotalMinor),
        })),
        { transaction },
      );
      await requisition.update({ status: 'converted' }, { transaction });
      await this.audit.record(
        {
          entityType: 'requisition',
          entityId: requisitionId,
          actorId,
          action: 'requisition.converted',
          fromState: 'approved',
          toState: 'converted',
          comment: `PO draft ${po.id} for vendor ${vendor.name}`,
        },
        transaction,
      );
      return po.id;
    });
    return this.findOne(poId);
  }

  // FR-204 / TC-204: cancel only while nothing has been received.
  async cancel(id: string, actorId: string): Promise<PoView> {
    await this.sequelize.transaction(async (transaction) => {
      const po = await this.orders.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!po) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found' });
      }
      const from = po.status;
      // The receipts check runs first so the caller gets the specific reason
      // (TC-204) — any received PO is uncancellable regardless of state.
      if ((await this.countReceipts(id, transaction)) > 0) {
        throw new ConflictException({
          code: 'CANCEL_BLOCKED_RECEIVED',
          message: 'This purchase order already has receipts and can no longer be cancelled',
        });
      }
      poLifecycle.assertCanTransition(from, 'cancelled');
      await po.update({ status: 'cancelled' }, { transaction });
      await this.audit.record(
        {
          entityType: 'purchase_order',
          entityId: id,
          actorId,
          action: 'po.cancelled',
          fromState: from,
          toState: 'cancelled',
        },
        transaction,
      );
    });
    return this.findOne(id);
  }

  // TC-204: a PO with any receipt can no longer be cancelled.
  private async countReceipts(poId: string, transaction: Transaction): Promise<number> {
    const rows = await this.sequelize.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM grns WHERE po_id = :poId',
      { replacements: { poId }, type: QueryTypes.SELECT, transaction },
    );
    return Number(rows[0].count);
  }

  // FR-604: a received PO can be closed once every invoice against it is
  // settled — payable or rejected; anything else (entered/exception/
  // awaiting_credit_note/matched/variance_accepted) is still open work.
  async close(id: string, actorId: string): Promise<PoView> {
    await this.sequelize.transaction(async (transaction) => {
      const po = await this.orders.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!po) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found' });
      }
      // Only a received PO may close — wrong state gives INVALID_TRANSITION.
      poLifecycle.assertCanTransition(po.status, 'closed');
      if ((await this.countOpenInvoices(id, transaction)) > 0) {
        throw new ConflictException({
          code: 'PO_HAS_OPEN_INVOICES',
          message: 'Every invoice must be settled (payable or rejected) before the PO can close',
        });
      }
      await po.update({ status: 'closed' }, { transaction });
      await this.audit.record(
        {
          entityType: 'purchase_order',
          entityId: id,
          actorId,
          action: 'po.closed',
          fromState: 'received',
          toState: 'closed',
        },
        transaction,
      );
    });
    return this.findOne(id);
  }

  // Invoices still in flight (not payable/rejected) block a PO close.
  private async countOpenInvoices(poId: string, transaction: Transaction): Promise<number> {
    const rows = await this.sequelize.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM invoices
       WHERE po_id = :poId AND status NOT IN ('payable', 'rejected')`,
      { replacements: { poId }, type: QueryTypes.SELECT, transaction },
    );
    return Number(rows[0].count);
  }

  // I-2 open-quantity math for the PO detail view (damaged tracked separately).
  private async receivedByPoLine(
    poId: string,
    transaction?: Transaction,
  ): Promise<Map<string, { good: number; damaged: number }>> {
    const rows = await this.sequelize.query<{
      po_line_id: string;
      total: string;
      damaged: string;
    }>(
      `SELECT gl.po_line_id, SUM(gl.quantity) AS total, SUM(gl.damaged_quantity) AS damaged
       FROM grn_lines gl JOIN grns g ON g.id = gl.grn_id
       WHERE g.po_id = :poId GROUP BY gl.po_line_id`,
      { replacements: { poId }, type: QueryTypes.SELECT, transaction },
    );
    return new Map(
      rows.map((row) => [
        row.po_line_id,
        { good: Number(row.total), damaged: Number(row.damaged) },
      ]),
    );
  }

  // FR-604 / TC-603: an amendment snapshots the current version (append-only)
  // and applies the changes as version N+1. A total increase parks the PO in
  // pending_reapproval — receiving and invoicing are status-gated, so both
  // stay blocked until an approver signs off.
  async amend(id: string, input: PoAmend, actorId: string): Promise<PoView> {
    const outcome = await this.sequelize.transaction(async (transaction) => {
      const po = await this.orders.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!po) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found' });
      }
      if (po.status !== 'issued' && po.status !== 'partially_received') {
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: `A purchase order in state '${po.status}' cannot be amended`,
        });
      }

      const lines = await this.lines.findAll({
        where: { poId: id },
        order: [['lineNo', 'ASC']],
        transaction,
      });
      const byId = new Map(lines.map((line) => [line.id, line]));
      const received = await this.receivedByPoLine(id, transaction);

      const oldVersion = po.version;
      const oldTotal = Number(po.totalMinor);
      const snapshot: PoVersionSnapshot = {
        totalMinor: oldTotal,
        lines: lines.map((line) => ({
          poLineId: line.id,
          lineNo: line.lineNo,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: Number(line.unitPriceMinor),
          lineTotalMinor: Number(line.lineTotalMinor),
        })),
      };

      const deltas: string[] = [];
      for (const change of input.lines) {
        const line = byId.get(change.poLineId);
        if (!line) {
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: `PO line ${change.poLineId} does not belong to this purchase order`,
          });
        }
        const newQty = change.quantity ?? line.quantity;
        const alreadyReceived = received.get(line.id)?.good ?? 0;
        // I-2 survives amendments: ordered may never drop below received.
        if (newQty < alreadyReceived) {
          throw new UnprocessableEntityException({
            code: 'AMEND_BELOW_RECEIVED',
            message: `Line ${line.lineNo}: quantity ${newQty} is below the ${alreadyReceived} already received`,
          });
        }
        const newPrice = change.unitPriceMinor ?? Number(line.unitPriceMinor);
        if (newQty !== line.quantity) {
          deltas.push(`line ${line.lineNo}: qty ${line.quantity} → ${newQty}`);
        }
        if (newPrice !== Number(line.unitPriceMinor)) {
          deltas.push(`line ${line.lineNo}: price ${Number(line.unitPriceMinor)} → ${newPrice}`);
        }
        await line.update(
          { quantity: newQty, unitPriceMinor: newPrice, lineTotalMinor: newQty * newPrice },
          { transaction },
        );
      }
      const newTotal = lines.reduce((sum, line) => sum + Number(line.lineTotalMinor), 0);
      const requiresReapproval = newTotal > oldTotal;

      await this.amendments.create(
        {
          poId: id,
          version: oldVersion,
          snapshot,
          reason: input.reason,
          requiresReapproval,
          amendedBy: actorId,
        },
        { transaction },
      );
      if (requiresReapproval) poLifecycle.assertCanTransition(po.status, 'pending_reapproval');
      const from = po.status;
      await po.update(
        {
          version: oldVersion + 1,
          totalMinor: newTotal,
          ...(requiresReapproval ? { status: 'pending_reapproval' } : {}),
        },
        { transaction },
      );
      await this.audit.record(
        {
          entityType: 'purchase_order',
          entityId: id,
          actorId,
          action: 'po.amended',
          ...(requiresReapproval ? { fromState: from, toState: 'pending_reapproval' } : {}),
          comment: `v${oldVersion} → v${oldVersion + 1}: ${input.reason} (${deltas.join('; ') || 'no changes'}); total ${oldTotal} → ${newTotal}${requiresReapproval ? '; re-approval required' : ''}`,
        },
        transaction,
      );
      return { requiresReapproval, requisitionId: po.requisitionId };
    });
    if (outcome.requiresReapproval) {
      // FR-604: a total-increasing amendment needs re-approval — notify the
      // approvers who signed off on the originating requisition (ADR-0002).
      const approverIds = await this.approvals.approverIdsFor(outcome.requisitionId);
      await this.notifications.emitEach(approverIds, (recipientId) => ({
        recipientId,
        type: 'po.reapproval_required',
        message: 'A purchase-order amendment needs your re-approval',
        entityType: 'purchase_order',
        entityId: id,
      }));
    }
    return this.findOne(id);
  }

  // FR-604: sign-off on a total-increasing amendment — the PO returns to
  // whatever state its receipts say it is in.
  async approveAmendment(id: string, actorId: string): Promise<PoView> {
    await this.sequelize.transaction(async (transaction) => {
      const po = await this.orders.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!po) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found' });
      }
      if (po.status !== 'pending_reapproval') {
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: `A purchase order in state '${po.status}' has no amendment awaiting approval`,
        });
      }
      const received = await this.receivedByPoLine(id, transaction);
      const target = [...received.values()].some((entry) => entry.good > 0)
        ? 'partially_received'
        : 'issued';
      poLifecycle.assertCanTransition(po.status, target);
      await po.update({ status: target }, { transaction });
      await this.audit.record(
        {
          entityType: 'purchase_order',
          entityId: id,
          actorId,
          action: 'po.amendment_approved',
          fromState: 'pending_reapproval',
          toState: target,
          comment: `v${po.version} approved`,
        },
        transaction,
      );
    });
    return this.findOne(id);
  }

  // FR-604: every version stays visible — superseded snapshots plus the live
  // row (as the highest version, flagged current).
  async versions(id: string, query: PaginationQuery): Promise<PagedResult<PoVersion>> {
    const po = await this.orders.findByPk(id, { include: [PoLine] });
    if (!po) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found' });
    }
    const { limit, offset } = pageOffset(query);
    const { rows, count } = await this.amendments.findAndCountAll({
      where: { poId: id },
      order: [['version', 'ASC']],
      limit,
      offset,
    });
    const items = rows.map((amendment) =>
      PoVersionSchema.parse({
        version: amendment.version,
        current: false,
        totalMinor: amendment.snapshot.totalMinor,
        lines: amendment.snapshot.lines,
        supersededReason: amendment.reason,
        supersededAt: (amendment.createdAt as Date).toISOString(),
      }),
    );
    // the live row is the last entry of the conceptual list (index = count)
    if (offset <= count && count < offset + limit) {
      items.push(
        PoVersionSchema.parse({
          version: po.version,
          current: true,
          totalMinor: Number(po.totalMinor),
          lines: (po.lines ?? [])
            .slice()
            .sort((a, b) => a.lineNo - b.lineNo)
            .map((line) => ({
              poLineId: line.id,
              lineNo: line.lineNo,
              description: line.description,
              quantity: line.quantity,
              unitPriceMinor: Number(line.unitPriceMinor),
              lineTotalMinor: Number(line.lineTotalMinor),
            })),
          supersededReason: null,
          supersededAt: null,
        }),
      );
    }
    return new PagedResult(items, pageMeta(query, count + 1));
  }

  async findAll(query: PoListQuery): Promise<PagedResult<PoView>> {
    const { rows, count } = await this.orders.findAndCountAll({
      // worklists filter server-side (e.g. warehouse: issued,partially_received)
      where: query.status ? { status: query.status } : undefined,
      include: [PoLine, Vendor],
      order: [['createdAt', 'DESC']],
      distinct: true,
      ...pageOffset(query),
    });
    return new PagedResult(
      rows.map((row) => this.toView(row)),
      pageMeta(query, count),
    );
  }

  async findOne(id: string): Promise<PoView> {
    const row = await this.orders.findByPk(id, { include: [PoLine, Vendor] });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found' });
    }
    return this.toView(row, await this.receivedByPoLine(id));
  }

  // FR-201: price/SKU edits before issue, with the delta audit-logged (TC-201).
  async updateLines(id: string, input: PoLineInput[], actorId: string): Promise<PoView> {
    await this.sequelize.transaction(async (transaction) => {
      // Lock the PO row alone — FOR UPDATE cannot span an outer-joined include.
      const po = await this.orders.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!po) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found' });
      }
      if (po.status !== 'draft') {
        // I-1 / FR-205: an issued PO's lines never change (amendments are v1).
        throw new ConflictException({
          code: 'PO_IMMUTABLE',
          message: 'An issued purchase order is immutable; amendments arrive in v1',
        });
      }

      const before = await this.lines.findAll({
        where: { poId: id },
        order: [['lineNo', 'ASC']],
        transaction,
      });
      const totals = computeTotals(input);
      const deltas: string[] = [];
      totals.lines.forEach((line, i) => {
        const prev = before[i];
        if (!prev) {
          deltas.push(`line ${line.lineNo}: added (${line.description})`);
          return;
        }
        if (Number(prev.unitPriceMinor) !== line.unitPriceMinor) {
          deltas.push(
            `line ${line.lineNo}: price ${Number(prev.unitPriceMinor)} → ${line.unitPriceMinor}`,
          );
        }
        const sku = (line as PoLineInput).vendorSku ?? null;
        if ((prev.vendorSku ?? null) !== sku) {
          deltas.push(`line ${line.lineNo}: sku ${prev.vendorSku ?? '∅'} → ${sku ?? '∅'}`);
        }
        if (prev.quantity !== line.quantity) {
          deltas.push(`line ${line.lineNo}: qty ${prev.quantity} → ${line.quantity}`);
        }
      });
      if (before.length > totals.lines.length) {
        deltas.push(`lines ${totals.lines.length + 1}..${before.length} removed`);
      }

      await this.lines.destroy({ where: { poId: id }, transaction });
      await this.lines.bulkCreate(
        totals.lines.map((line) => ({ ...line, poId: id })),
        { transaction },
      );
      await po.update({ totalMinor: totals.totalMinor }, { transaction });
      if (deltas.length > 0) {
        await this.audit.record(
          {
            entityType: 'purchase_order',
            entityId: id,
            actorId,
            action: 'po.lines_edited',
            comment: deltas.join('; '),
          },
          transaction,
        );
      }
    });
    return this.findOne(id);
  }

  private toView(
    row: PurchaseOrder,
    received?: Map<string, { good: number; damaged: number }>,
  ): PoView {
    return PurchaseOrderSchema.parse({
      id: row.id,
      poNumber: row.poNumber,
      status: row.status,
      vendorId: row.vendorId,
      vendorName: row.vendor?.name ?? 'Unknown',
      requisitionId: row.requisitionId,
      currency: row.currency,
      totalMinor: Number(row.totalMinor),
      version: row.version,
      lines: (row.lines ?? [])
        .slice()
        .sort((a, b) => a.lineNo - b.lineNo)
        .map((line) => ({
          id: line.id,
          lineNo: line.lineNo,
          description: line.description,
          category: line.category,
          vendorSku: line.vendorSku,
          quantity: line.quantity,
          unitPriceMinor: Number(line.unitPriceMinor),
          lineTotalMinor: Number(line.lineTotalMinor),
          ...(received
            ? {
                receivedQuantity: received.get(line.id)?.good ?? 0,
                openQuantity: line.quantity - (received.get(line.id)?.good ?? 0),
                damagedQuantity: received.get(line.id)?.damaged ?? 0,
              }
            : {}),
        })),
      createdAt: (row.createdAt as Date).toISOString(),
      updatedAt: (row.updatedAt as Date).toISOString(),
    });
  }
}
