import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Grn as GrnView, GrnCreate, GrnSchema } from '@trimatch/shared';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import { formatDocNumber, SequencesService } from '../common/sequences.service';
import { User } from '../identity/user.model';
import { poLifecycle } from '../purchasing/po.lifecycle';
import { PoLine, PurchaseOrder } from '../purchasing/purchase-order.model';
import { Grn, GrnLine } from './grn.model';

@Injectable()
export class ReceivingService {
  constructor(
    @InjectModel(Grn) private readonly grns: typeof Grn,
    @InjectModel(GrnLine) private readonly grnLines: typeof GrnLine,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly sequences: SequencesService,
    private readonly audit: AuditService,
  ) {}

  // FR-301/302 (TC-301/302): record a receipt per PO line inside one
  // transaction — GRN number claimed gapless, open-qty math per I-2, PO moves
  // to partially_received / received.
  async receive(input: GrnCreate, actorId: string): Promise<GrnView> {
    const grnId = await this.sequelize.transaction(async (transaction) => {
      const po = await PurchaseOrder.findByPk(input.poId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!po) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found' });
      }
      if (po.status !== 'issued' && po.status !== 'partially_received') {
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: `A purchase order in state '${po.status}' cannot receive goods`,
        });
      }

      const poLines = await PoLine.findAll({ where: { poId: po.id }, transaction });
      const byId = new Map(poLines.map((line) => [line.id, line]));
      const received = await this.receivedByPoLine(po.id, transaction);

      for (const line of input.lines) {
        const poLine = byId.get(line.poLineId);
        if (!poLine) {
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: `PO line ${line.poLineId} does not belong to this purchase order`,
          });
        }
        // I-2: Σ received per line ≤ ordered (formalized by TC-303).
        const already = received.get(line.poLineId) ?? 0;
        if (already + line.quantity > poLine.quantity) {
          throw new UnprocessableEntityException({
            code: 'OVER_RECEIPT_BLOCKED',
            message: `Line ${poLine.lineNo}: receiving ${line.quantity} exceeds open quantity ${poLine.quantity - already}`,
          });
        }
      }

      const year = new Date().getUTCFullYear();
      const sequence = await this.sequences.claim('GRN', year, transaction);
      const grn = await this.grns.create(
        {
          grnNumber: formatDocNumber('GRN', year, sequence),
          poId: po.id,
          receivedBy: actorId,
          note: input.note ?? null,
        },
        { transaction },
      );
      await this.grnLines.bulkCreate(
        input.lines.map((line) => ({ ...line, grnId: grn.id })),
        { transaction },
      );
      await this.audit.record(
        {
          entityType: 'grn',
          entityId: grn.id,
          actorId,
          action: 'grn.recorded',
          comment: `${grn.grnNumber} against PO ${po.poNumber ?? po.id}`,
        },
        transaction,
      );

      // Recompute open quantities including this receipt.
      const after = await this.receivedByPoLine(po.id, transaction);
      const allReceived = poLines.every((line) => (after.get(line.id) ?? 0) >= line.quantity);
      const target = allReceived ? 'received' : 'partially_received';
      if (po.status !== target) {
        poLifecycle.assertCanTransition(po.status, target);
        const from = po.status;
        await po.update({ status: target }, { transaction });
        await this.audit.record(
          {
            entityType: 'purchase_order',
            entityId: po.id,
            actorId,
            action: `po.${target}`,
            fromState: from,
            toState: target,
          },
          transaction,
        );
      }
      return grn.id;
    });
    return this.findOne(grnId);
  }

  async receivedByPoLine(poId: string, transaction?: Transaction): Promise<Map<string, number>> {
    const rows = await this.sequelize.query<{ po_line_id: string; total: string }>(
      `SELECT gl.po_line_id, SUM(gl.quantity) AS total
       FROM grn_lines gl JOIN grns g ON g.id = gl.grn_id
       WHERE g.po_id = :poId GROUP BY gl.po_line_id`,
      { replacements: { poId }, type: QueryTypes.SELECT, transaction },
    );
    return new Map(rows.map((row) => [row.po_line_id, Number(row.total)]));
  }

  async findOne(id: string): Promise<GrnView> {
    const row = await this.grns.findByPk(id, { include: [GrnLine, User] });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'GRN not found' });
    }
    return GrnSchema.parse({
      id: row.id,
      grnNumber: row.grnNumber,
      poId: row.poId,
      receivedByName: row.receiver?.fullName ?? 'Unknown',
      note: row.note,
      lines: (row.lines ?? []).map((line) => ({
        poLineId: line.poLineId,
        quantity: line.quantity,
      })),
      createdAt: (row.createdAt as Date).toISOString(),
    });
  }
}
