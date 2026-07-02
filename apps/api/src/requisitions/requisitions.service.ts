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
} from '@trimatch/shared';
import { Sequelize } from 'sequelize-typescript';
import { Requisition, RequisitionLine } from './requisition.model';
import { computeTotals } from './requisition.totals';

@Injectable()
export class RequisitionsService {
  constructor(
    @InjectModel(Requisition) private readonly requisitions: typeof Requisition,
    @InjectModel(RequisitionLine) private readonly lines: typeof RequisitionLine,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

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

  async findAllOwn(requesterId: string): Promise<RequisitionView[]> {
    const rows = await this.requisitions.findAll({
      where: { requesterId },
      include: [RequisitionLine],
      order: [
        ['createdAt', 'DESC'],
        [{ model: RequisitionLine, as: 'lines' }, 'lineNo', 'ASC'],
      ],
    });
    return rows.map((row) => this.toView(row));
  }

  async findOwn(id: string, requesterId: string): Promise<RequisitionView> {
    const row = await this.requisitions.findByPk(id, { include: [RequisitionLine] });
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
      createdAt: (row.createdAt as Date).toISOString(),
      updatedAt: (row.updatedAt as Date).toISOString(),
    });
  }
}
