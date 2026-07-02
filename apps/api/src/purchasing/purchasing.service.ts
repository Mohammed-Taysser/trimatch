import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { PoLineInput, PurchaseOrder as PoView, PurchaseOrderSchema } from '@trimatch/shared';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import { requisitionLifecycle } from '../requisitions/requisition.lifecycle';
import { Requisition, RequisitionLine } from '../requisitions/requisition.model';
import { computeTotals } from '../requisitions/requisition.totals';
import { Vendor } from '../vendors/vendor.model';
import { VendorsService } from '../vendors/vendors.service';
import { PoLine, PurchaseOrder } from './purchase-order.model';

@Injectable()
export class PurchasingService {
  constructor(
    @InjectModel(PurchaseOrder) private readonly orders: typeof PurchaseOrder,
    @InjectModel(PoLine) private readonly lines: typeof PoLine,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly vendors: VendorsService,
    private readonly audit: AuditService,
  ) {}

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

  async findAll(): Promise<PoView[]> {
    const rows = await this.orders.findAll({
      include: [PoLine, Vendor],
      order: [['createdAt', 'DESC']],
    });
    return rows.map((row) => this.toView(row));
  }

  async findOne(id: string): Promise<PoView> {
    const row = await this.orders.findByPk(id, { include: [PoLine, Vendor] });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found' });
    }
    return this.toView(row);
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
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: 'Only draft purchase orders can be edited',
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

  private toView(row: PurchaseOrder): PoView {
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
        })),
      createdAt: (row.createdAt as Date).toISOString(),
      updatedAt: (row.updatedAt as Date).toISOString(),
    });
  }
}
