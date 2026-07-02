import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import {
  Invoice as InvoiceView,
  InvoiceCreate,
  InvoiceSchema,
  PaginationQuery,
} from '@trimatch/shared';
import { UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import { PagedResult, pageMeta, pageOffset } from '../common/paged';
import { PoLine, PurchaseOrder } from '../purchasing/purchase-order.model';
import { Vendor } from '../vendors/vendor.model';
import { Invoice, InvoiceLine } from './invoice.model';

const INVOICEABLE_PO_STATES = new Set(['issued', 'partially_received', 'received', 'closed']);

@Injectable()
export class InvoicingService {
  constructor(
    @InjectModel(Invoice) private readonly invoices: typeof Invoice,
    @InjectModel(InvoiceLine) private readonly lines: typeof InvoiceLine,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly audit: AuditService,
  ) {}

  // FR-401 / TC-401: record the vendor's bill; duplicates (vendor + invoice
  // number) are refused; totals must be exact in minor units (I-8).
  async create(input: InvoiceCreate, actorId: string): Promise<InvoiceView> {
    const invoiceId = await this.sequelize.transaction(async (transaction) => {
      const po = await PurchaseOrder.findByPk(input.poId, { transaction });
      if (!po) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found' });
      }
      if (!INVOICEABLE_PO_STATES.has(po.status)) {
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: `A purchase order in state '${po.status}' cannot be invoiced`,
        });
      }

      const poLines = await PoLine.findAll({ where: { poId: po.id }, transaction });
      const poLineIds = new Set(poLines.map((line) => line.id));
      for (const line of input.lines) {
        if (!poLineIds.has(line.poLineId)) {
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: `PO line ${line.poLineId} does not belong to this purchase order`,
          });
        }
      }

      // Record the vendor's paper as-is (I-8 integer math). A total that is
      // not backed by the line items (unlisted shipping, fees — PRD case H)
      // is the 3-way match's job to flag, not entry validation's.
      const computed = input.lines.map((line) => ({
        ...line,
        lineTotalMinor: line.quantity * line.unitPriceMinor,
      }));
      const subtotal = computed.reduce((sum, line) => sum + line.lineTotalMinor, 0);

      try {
        const invoice = await this.invoices.create(
          {
            invoiceNumber: input.invoiceNumber,
            vendorId: po.vendorId,
            poId: po.id,
            status: 'entered',
            invoiceDate: input.invoiceDate,
            dueDate: input.dueDate ?? null,
            currency: po.currency,
            isFinal: input.isFinal ?? false,
            subtotalMinor: subtotal,
            taxMinor: input.taxMinor,
            totalMinor: input.totalMinor,
            enteredBy: actorId,
          },
          { transaction },
        );
        await this.lines.bulkCreate(
          computed.map((line) => ({ ...line, invoiceId: invoice.id })),
          { transaction },
        );
        await this.audit.record(
          {
            entityType: 'invoice',
            entityId: invoice.id,
            actorId,
            action: 'invoice.entered',
            toState: 'entered',
            comment: `${input.invoiceNumber} against PO ${po.poNumber ?? po.id}`,
          },
          transaction,
        );
        return invoice.id;
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          throw new ConflictException({
            code: 'DUPLICATE_INVOICE',
            message: 'This vendor already has an invoice with this number',
          });
        }
        throw error;
      }
    });
    return this.findOne(invoiceId);
  }

  async findAll(query: PaginationQuery): Promise<PagedResult<InvoiceView>> {
    const { rows, count } = await this.invoices.findAndCountAll({
      include: [InvoiceLine, Vendor, PurchaseOrder],
      order: [['createdAt', 'DESC']],
      distinct: true,
      ...pageOffset(query),
    });
    return new PagedResult(
      rows.map((row) => this.toView(row)),
      pageMeta(query, count),
    );
  }

  async findOne(id: string): Promise<InvoiceView> {
    const row = await this.invoices.findByPk(id, {
      include: [InvoiceLine, Vendor, PurchaseOrder],
    });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invoice not found' });
    }
    return this.toView(row);
  }

  private toView(row: Invoice): InvoiceView {
    return InvoiceSchema.parse({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      vendorId: row.vendorId,
      vendorName: row.vendor?.name ?? 'Unknown',
      poId: row.poId,
      poNumber: row.po?.poNumber ?? null,
      status: row.status,
      invoiceDate: row.invoiceDate,
      dueDate: row.dueDate,
      currency: row.currency,
      subtotalMinor: Number(row.subtotalMinor),
      taxMinor: Number(row.taxMinor),
      totalMinor: Number(row.totalMinor),
      isFinal: row.isFinal,
      lines: (row.lines ?? []).map((line) => ({
        poLineId: line.poLineId,
        quantity: line.quantity,
        unitPriceMinor: Number(line.unitPriceMinor),
        lineTotalMinor: Number(line.lineTotalMinor),
      })),
      createdAt: (row.createdAt as Date).toISOString(),
    });
  }
}
