import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import {
  PaginationQuery,
  PoLineInput,
  PurchaseOrder as PoView,
  PurchaseOrderSchema,
} from '@trimatch/shared';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import { PagedResult, pageMeta, pageOffset } from '../common/paged';
import { formatDocNumber, SequencesService } from '../common/sequences.service';
import { requisitionLifecycle } from '../requisitions/requisition.lifecycle';
import { Requisition, RequisitionLine } from '../requisitions/requisition.model';
import { computeTotals } from '../requisitions/requisition.totals';
import { Vendor } from '../vendors/vendor.model';
import { VendorsService } from '../vendors/vendors.service';
import { poLifecycle } from './po.lifecycle';
import { PoLine, PurchaseOrder } from './purchase-order.model';

@Injectable()
export class PurchasingService {
  constructor(
    @InjectModel(PurchaseOrder) private readonly orders: typeof PurchaseOrder,
    @InjectModel(PoLine) private readonly lines: typeof PoLine,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly vendors: VendorsService,
    private readonly audit: AuditService,
    private readonly sequences: SequencesService,
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

  // I-2 open-quantity math for the PO detail view (damaged tracked separately).
  private async receivedByPoLine(
    poId: string,
  ): Promise<Map<string, { good: number; damaged: number }>> {
    const rows = await this.sequelize.query<{
      po_line_id: string;
      total: string;
      damaged: string;
    }>(
      `SELECT gl.po_line_id, SUM(gl.quantity) AS total, SUM(gl.damaged_quantity) AS damaged
       FROM grn_lines gl JOIN grns g ON g.id = gl.grn_id
       WHERE g.po_id = :poId GROUP BY gl.po_line_id`,
      { replacements: { poId }, type: QueryTypes.SELECT },
    );
    return new Map(
      rows.map((row) => [
        row.po_line_id,
        { good: Number(row.total), damaged: Number(row.damaged) },
      ]),
    );
  }

  async findAll(query: PaginationQuery): Promise<PagedResult<PoView>> {
    const { rows, count } = await this.orders.findAndCountAll({
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
