import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ExceptionsQuery,
  ExceptionsSummary,
  ExceptionsSummaryQuery,
  ExceptionsSummarySchema,
} from '@trimatch/shared';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { MatchRecord as MatchRecordView, MatchRecordSchema } from '@trimatch/shared';
import { literal, Op, Order, QueryTypes, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import { invoiceLifecycle } from '../invoicing/invoice.lifecycle';
import { Invoice, InvoiceLine } from '../invoicing/invoice.model';
import { PagedResult, pageMeta, pageOffset } from '../common/paged';
import { UsersService } from '../identity/users.service';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { PoLine } from '../purchasing/purchase-order.model';
import { Vendor } from '../vendors/vendor.model';
import { MatchRecord } from './match-record.model';
import { DEFAULT_TOLERANCES, evaluateMatch, MatchLineInput } from './tolerance.rules';

// FR-603: how the queue can be worked — oldest first is the default worklist.
const EXCEPTION_SORTS: Record<ExceptionsQuery['sort'], Order> = {
  oldest: [['createdAt', 'ASC']],
  newest: [['createdAt', 'DESC']],
  vendor: [
    [{ model: Vendor, as: 'vendor' }, 'name', 'ASC'],
    ['createdAt', 'ASC'],
  ],
  reason: [
    [literal(`"matchRecords"."reasons"->0->>'code'`), 'ASC'],
    ['createdAt', 'ASC'],
  ],
};

@Injectable()
export class MatchingService {
  constructor(
    @InjectModel(MatchRecord) private readonly records: typeof MatchRecord,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsProducer,
  ) {}

  // FR-402/403: evaluate PO ↔ GRN ↔ INV per line within tolerances; persist an
  // immutable match record; matched → payable, otherwise → exception.
  async match(invoiceId: string, actorId: string): Promise<MatchRecordView> {
    const outcome = await this.sequelize.transaction(async (transaction) => {
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
      return { recordId: record.id, exception: result.outcome !== 'matched' };
    });
    if (outcome.exception) {
      // FR-406: an exception lands in AP's queue — notify every AP user.
      const apIds = await this.users.findIdsByRole('ap');
      await this.notifications.emitEach(apIds, (recipientId) => ({
        recipientId,
        type: 'invoice.exception',
        message: 'An invoice failed 3-way match and needs review',
        entityType: 'invoice',
        entityId: invoiceId,
      }));
    }
    return this.findOne(outcome.recordId);
  }

  // FR-404: apply a received credit note to an invoice held in
  // awaiting_credit_note. A credit note is a total-level document, so this
  // reconciles at the total level (re-running the line-level match would keep
  // firing the per-line price variance the credit is meant to settle): the
  // credit must bring the net payable (invoice total − credit) within
  // tolerance of the PO-expected total, else it is refused and the invoice
  // stays held. On success the invoice completes matched → payable.
  async applyCreditNote(
    invoiceId: string,
    creditMinor: number,
    reference: string,
    actorId: string,
  ): Promise<MatchRecordView> {
    const recordId = await this.sequelize.transaction(async (transaction) => {
      // Lock the invoice row alone — FOR UPDATE cannot span an outer-joined
      // include (InvoiceLine); load the lines separately.
      const invoice = await Invoice.findByPk(invoiceId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!invoice) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }
      if (invoice.status !== 'awaiting_credit_note') {
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: `Only an invoice held for a credit note can have one applied (status '${invoice.status}')`,
        });
      }

      const invoiceTotal = Number(invoice.totalMinor);
      if (creditMinor > invoiceTotal) {
        throw new UnprocessableEntityException({
          code: 'CREDIT_NOTE_EXCESSIVE',
          message: `Credit note ${creditMinor} exceeds the invoice total ${invoiceTotal}`,
        });
      }

      // PO-expected payable: the invoiced quantities at PO prices, plus tax.
      const invoiceLines = await InvoiceLine.findAll({ where: { invoiceId }, transaction });
      const poLines = await PoLine.findAll({ where: { poId: invoice.poId }, transaction });
      const poPriceById = new Map(poLines.map((line) => [line.id, Number(line.unitPriceMinor)]));
      let poExpected = Number(invoice.taxMinor);
      for (const line of invoiceLines) {
        const poPrice = poPriceById.get(line.poLineId);
        if (poPrice === undefined) {
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: `PO line ${line.poLineId} not found for this invoice`,
          });
        }
        poExpected += line.quantity * poPrice;
      }

      const netPayable = invoiceTotal - creditMinor;
      const delta = netPayable - poExpected;
      if (Math.abs(delta) > DEFAULT_TOLERANCES.totalToleranceAbsMinor) {
        throw new UnprocessableEntityException({
          code: 'CREDIT_NOTE_INSUFFICIENT',
          message: `Net payable ${netPayable} still differs from the PO-expected ${poExpected} by ${delta} (tolerance ±${DEFAULT_TOLERANCES.totalToleranceAbsMinor})`,
        });
      }

      invoiceLifecycle.assertCanTransition('awaiting_credit_note', 'matched');
      const record = await this.records.create(
        {
          invoiceId,
          outcome: 'matched',
          tolerances: DEFAULT_TOLERANCES,
          comparisons: [],
          reasons: [],
          expectedTotalMinor: poExpected,
          totalDeltaMinor: delta,
          matchedBy: actorId,
        },
        { transaction },
      );
      await invoice.update(
        { creditNoteMinor: creditMinor, creditNoteRef: reference, status: 'matched' },
        { transaction },
      );
      await this.audit.record(
        {
          entityType: 'invoice',
          entityId: invoiceId,
          actorId,
          action: 'invoice.credit_note_applied',
          fromState: 'awaiting_credit_note',
          toState: 'matched',
          comment: `credit note ${reference} for ${creditMinor}; net payable ${netPayable} (match record ${record.id})`,
        },
        transaction,
      );
      invoiceLifecycle.assertCanTransition('matched', 'payable');
      await invoice.update({ status: 'payable' }, { transaction });
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
      return record.id;
    });
    return this.findOne(recordId);
  }

  // FR-603: counts per reason drive the queue header — an invoice carrying
  // two reasons counts toward both, so the sum can exceed total.
  async exceptionsSummary(query: ExceptionsSummaryQuery): Promise<ExceptionsSummary> {
    const filters = ['i.status = :status'];
    const replacements: Record<string, unknown> = { status: 'exception' };
    if (query.vendorId) {
      filters.push('i.vendor_id = :vendorId');
      replacements.vendorId = query.vendorId;
    }
    if (query.olderThanDays !== undefined) {
      filters.push('i.created_at <= :cutoff');
      replacements.cutoff = new Date(Date.now() - query.olderThanDays * 86_400_000);
    }
    const where = filters.join(' AND ');
    const counts = await this.sequelize.query<{ reason: string; count: string }>(
      `SELECT reason.elem->>'code' AS reason, COUNT(DISTINCT i.id) AS count
       FROM invoices i
       JOIN match_records m ON m.invoice_id = i.id
       CROSS JOIN LATERAL jsonb_array_elements(m.reasons) AS reason(elem)
       WHERE ${where}
       GROUP BY reason.elem->>'code'
       ORDER BY reason.elem->>'code'`,
      { replacements, type: QueryTypes.SELECT },
    );
    const total = await this.sequelize.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM invoices i WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT },
    );
    return ExceptionsSummarySchema.parse({
      total: Number(total[0].count),
      counts: counts.map((row) => ({ reason: row.reason, count: Number(row.count) })),
    });
  }

  // FR-403/FR-603: the exceptions queue — every exception invoice with its
  // match record (the side-by-side deltas), filterable by vendor/reason/age.
  async exceptions(query: ExceptionsQuery) {
    const where: WhereOptions = { status: 'exception' };
    if (query.vendorId) Object.assign(where, { vendorId: query.vendorId });
    if (query.olderThanDays !== undefined) {
      Object.assign(where, {
        createdAt: { [Op.lte]: new Date(Date.now() - query.olderThanDays * 86_400_000) },
      });
    }
    const { rows, count } = await Invoice.findAndCountAll({
      where,
      include: [
        Vendor,
        {
          model: MatchRecord,
          required: true,
          // reason is enum-validated by the DTO — safe to inline.
          where: query.reason
            ? literal(`"matchRecords"."reasons" @> '[{"code":"${query.reason}"}]'`)
            : undefined,
        },
      ],
      order: EXCEPTION_SORTS[query.sort],
      distinct: true,
      // an invoice has exactly one match record (re-matching is refused), so
      // the flat join is safe — and the reason/vendor sorts need the joined
      // aliases visible to ORDER BY, which the wrapped subquery hides.
      subQuery: false,
      ...pageOffset({ page: query.page, pageSize: query.pageSize }),
    });
    const items = rows.map((invoice) => {
      const latest = (invoice.matchRecords ?? [])
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          vendorId: invoice.vendorId,
          vendorName: invoice.vendor?.name ?? 'Unknown',
          totalMinor: Number(invoice.totalMinor),
          currency: invoice.currency,
          invoiceDate: invoice.invoiceDate,
          ageDays: Math.floor((Date.now() - (invoice.createdAt as Date).getTime()) / 86_400_000),
        },
        match: {
          id: latest.id,
          outcome: latest.outcome,
          reasons: latest.reasons,
          comparisons: latest.comparisons,
          tolerances: latest.tolerances,
          expectedTotalMinor: Number(latest.expectedTotalMinor),
          totalDeltaMinor: Number(latest.totalDeltaMinor),
        },
      };
    });
    return new PagedResult(items, pageMeta({ page: query.page, pageSize: query.pageSize }, count));
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
