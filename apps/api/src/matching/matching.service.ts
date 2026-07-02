import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { MatchRecord as MatchRecordView, MatchRecordSchema } from '@trimatch/shared';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import { invoiceLifecycle } from '../invoicing/invoice.lifecycle';
import { Invoice, InvoiceLine } from '../invoicing/invoice.model';
import { PoLine } from '../purchasing/purchase-order.model';
import { MatchRecord } from './match-record.model';
import { DEFAULT_TOLERANCES, evaluateMatch, MatchLineInput } from './tolerance.rules';

@Injectable()
export class MatchingService {
  constructor(
    @InjectModel(MatchRecord) private readonly records: typeof MatchRecord,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly audit: AuditService,
  ) {}

  // FR-402/403: evaluate PO ↔ GRN ↔ INV per line within tolerances; persist an
  // immutable match record; matched → payable, otherwise → exception.
  async match(invoiceId: string, actorId: string): Promise<MatchRecordView> {
    const recordId = await this.sequelize.transaction(async (transaction) => {
      const invoice = await Invoice.findByPk(invoiceId, {
        include: [InvoiceLine],
        transaction,
      });
      if (!invoice) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }
      if (invoice.status !== 'entered') {
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: `An invoice in state '${invoice.status}' cannot be matched again`,
        });
      }

      const poLines = await PoLine.findAll({ where: { poId: invoice.poId }, transaction });
      const poLineById = new Map(poLines.map((line) => [line.id, line]));

      const received = await this.sums(
        `SELECT gl.po_line_id AS key, SUM(gl.quantity) AS total
         FROM grn_lines gl JOIN grns g ON g.id = gl.grn_id
         WHERE g.po_id = :poId GROUP BY gl.po_line_id`,
        { poId: invoice.poId },
        transaction,
      );
      const previouslyInvoiced = await this.sums(
        `SELECT il.po_line_id AS key, SUM(il.quantity) AS total
         FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id
         WHERE i.po_id = :poId AND i.id != :invoiceId AND i.status != 'rejected'
         GROUP BY il.po_line_id`,
        { poId: invoice.poId, invoiceId },
        transaction,
      );

      const lines: MatchLineInput[] = (invoice.lines ?? []).map((line) => {
        const poLine = poLineById.get(line.poLineId);
        if (!poLine) {
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: `PO line ${line.poLineId} not found for this invoice`,
          });
        }
        return {
          poLineId: poLine.id,
          lineNo: poLine.lineNo,
          orderedQty: poLine.quantity,
          poUnitPriceMinor: Number(poLine.unitPriceMinor),
          receivedQty: received.get(poLine.id) ?? 0,
          previouslyInvoicedQty: previouslyInvoiced.get(poLine.id) ?? 0,
          invoicedQty: line.quantity,
          invoiceUnitPriceMinor: Number(line.unitPriceMinor),
        };
      });

      const result = evaluateMatch(
        {
          lines,
          taxMinor: Number(invoice.taxMinor),
          invoiceTotalMinor: Number(invoice.totalMinor),
          isFinal: Boolean(invoice.get('isFinal')),
        },
        DEFAULT_TOLERANCES,
      );

      const record = await this.records.create(
        {
          invoiceId,
          outcome: result.outcome,
          tolerances: result.tolerances,
          comparisons: result.comparisons,
          reasons: result.reasons,
          expectedTotalMinor: result.expectedTotalMinor,
          totalDeltaMinor: result.totalDeltaMinor,
          matchedBy: actorId,
        },
        { transaction },
      );

      if (result.outcome === 'matched') {
        // FR-403/FR-406: matched auto-advances to payable — the match record
        // above is the hard payable gate.
        invoiceLifecycle.assertCanTransition('entered', 'matched');
        invoiceLifecycle.assertCanTransition('matched', 'payable');
        await invoice.update({ status: 'payable' }, { transaction });
        await this.audit.record(
          {
            entityType: 'invoice',
            entityId: invoiceId,
            actorId,
            action: 'invoice.matched',
            fromState: 'entered',
            toState: 'matched',
            comment: `match record ${record.id}`,
          },
          transaction,
        );
        await this.audit.record(
          {
            entityType: 'invoice',
            entityId: invoiceId,
            actorId,
            action: 'invoice.payable',
            fromState: 'matched',
            toState: 'payable',
          },
          transaction,
        );
      } else {
        invoiceLifecycle.assertCanTransition('entered', 'exception');
        await invoice.update({ status: 'exception' }, { transaction });
        await this.audit.record(
          {
            entityType: 'invoice',
            entityId: invoiceId,
            actorId,
            action: 'invoice.exception',
            fromState: 'entered',
            toState: 'exception',
            comment: result.reasons.map((r) => r.code).join(', '),
          },
          transaction,
        );
      }
      return record.id;
    });
    return this.findOne(recordId);
  }

  async findOne(id: string): Promise<MatchRecordView> {
    const row = await this.records.findByPk(id);
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Match record not found' });
    }
    return MatchRecordSchema.parse({
      id: row.id,
      invoiceId: row.invoiceId,
      outcome: row.outcome,
      tolerances: row.tolerances,
      comparisons: row.comparisons,
      reasons: row.reasons,
      expectedTotalMinor: Number(row.expectedTotalMinor),
      totalDeltaMinor: Number(row.totalDeltaMinor),
      createdAt: row.createdAt.toISOString(),
    });
  }

  private async sums(
    sql: string,
    replacements: Record<string, string>,
    transaction: import('sequelize').Transaction,
  ): Promise<Map<string, number>> {
    const rows = await this.sequelize.query<{ key: string; total: string }>(sql, {
      replacements,
      type: QueryTypes.SELECT,
      transaction,
    });
    return new Map(rows.map((row) => [row.key, Number(row.total)]));
  }
}
