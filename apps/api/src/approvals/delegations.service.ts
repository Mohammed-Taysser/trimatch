import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Delegation as DelegationView, DelegationSchema, PaginationQuery } from '@trimatch/shared';
import { Op } from 'sequelize';
import { AuditService } from '../audit/audit.service';
import { PagedResult, pageMeta, pageOffset } from '../common/paged';
import { User } from '../identity/user.model';
import { Delegation } from './delegation.model';

@Injectable()
export class DelegationsService {
  constructor(
    @InjectModel(Delegation) private readonly delegations: typeof Delegation,
    private readonly audit: AuditService,
  ) {}

  async create(
    delegatorId: string,
    delegateEmail: string,
    startsOn: string,
    endsOn: string,
  ): Promise<DelegationView> {
    if (endsOn < startsOn) {
      throw new UnprocessableEntityException({
        code: 'INVALID_WINDOW',
        message: 'The delegation window must end on or after its start',
      });
    }
    const delegate = await User.findOne({ where: { email: delegateEmail.toLowerCase() } });
    if (!delegate) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Delegate user not found' });
    }
    if (delegate.id === delegatorId) {
      throw new ConflictException({
        code: 'SELF_DELEGATION',
        message: 'You cannot delegate approvals to yourself',
      });
    }
    const row = await this.delegations.create({
      delegatorId,
      delegateId: delegate.id,
      startsOn,
      endsOn,
    });
    await this.audit.record({
      entityType: 'delegation',
      entityId: row.id,
      actorId: delegatorId,
      action: 'delegation.created',
      comment: `to ${delegate.fullName} (${startsOn} → ${endsOn})`,
    });
    return this.toView(
      (await this.delegations.findByPk(row.id, {
        include: [
          { model: User, as: 'delegator' },
          { model: User, as: 'delegate' },
        ],
      })) as Delegation,
    );
  }

  async listOwn(delegatorId: string, query: PaginationQuery): Promise<PagedResult<DelegationView>> {
    const { rows, count } = await this.delegations.findAndCountAll({
      where: { delegatorId },
      include: [
        { model: User, as: 'delegator' },
        { model: User, as: 'delegate' },
      ],
      order: [['startsOn', 'DESC']],
      distinct: true,
      ...pageOffset(query),
    });
    return new PagedResult(
      rows.map((row) => this.toView(row)),
      pageMeta(query, count),
    );
  }

  async revoke(id: string, delegatorId: string): Promise<void> {
    const row = await this.delegations.findByPk(id);
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Delegation not found' });
    }
    if (row.delegatorId !== delegatorId) {
      throw new ConflictException({
        code: 'FORBIDDEN',
        message: 'Only the delegator may revoke this delegation',
      });
    }
    await row.destroy();
    await this.audit.record({
      entityType: 'delegation',
      entityId: id,
      actorId: delegatorId,
      action: 'delegation.revoked',
    });
  }

  /** delegator ids whose approvals `delegateId` may act on today */
  async activeDelegatorsFor(delegateId: string): Promise<string[]> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.delegations.findAll({
      where: {
        delegateId,
        startsOn: { [Op.lte]: today },
        endsOn: { [Op.gte]: today },
      },
    });
    return rows.map((row) => row.delegatorId);
  }

  /** active delegation from `delegatorId` to `delegateId`, if any (today) */
  async activeDelegation(delegatorId: string, delegateId: string): Promise<Delegation | null> {
    const today = new Date().toISOString().slice(0, 10);
    return this.delegations.findOne({
      where: {
        delegatorId,
        delegateId,
        startsOn: { [Op.lte]: today },
        endsOn: { [Op.gte]: today },
      },
      include: [{ model: User, as: 'delegator' }],
    });
  }

  private toView(row: Delegation): DelegationView {
    return DelegationSchema.parse({
      id: row.id,
      delegatorId: row.delegatorId,
      delegatorName: row.delegator?.fullName ?? 'Unknown',
      delegateId: row.delegateId,
      delegateName: row.delegate?.fullName ?? 'Unknown',
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      createdAt: (row.createdAt as Date).toISOString(),
    });
  }
}
