import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AuditEntry as AuditEntryView, AuditEntrySchema, AuditQuery } from '@trimatch/shared';
import { Transaction, WhereOptions } from 'sequelize';
import { PagedResult, pageMeta, pageOffset } from '../common/paged';
import { User } from '../identity/user.model';
import { AuditEntry } from './audit-entry.model';

export interface AuditRecord {
  entityType: string;
  entityId: string;
  actorId: string;
  action: string;
  fromState?: string;
  toState?: string;
  comment?: string;
}

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditEntry) private readonly entries: typeof AuditEntry) {}

  // Callers pass their transaction so the audit row commits atomically with
  // the state change it describes (architecture §3).
  async record(record: AuditRecord, transaction?: Transaction): Promise<void> {
    await this.entries.create({ ...record }, { transaction });
  }

  // Superadmin dashboard: read-only browsing of the append-only trail —
  // filter by entity for a document timeline, newest first.
  async list(query: AuditQuery): Promise<PagedResult<AuditEntryView>> {
    const where: WhereOptions = {};
    if (query.entityType) Object.assign(where, { entityType: query.entityType });
    if (query.entityId) Object.assign(where, { entityId: query.entityId });
    if (query.actorId) Object.assign(where, { actorId: query.actorId });
    const { rows, count } = await this.entries.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      ...pageOffset(query),
    });
    const actorIds = [...new Set(rows.map((row) => row.actorId))];
    const actors = actorIds.length ? await User.findAll({ where: { id: actorIds } }) : [];
    const nameById = new Map(actors.map((actor) => [actor.id, actor.fullName]));
    return new PagedResult(
      rows.map((row) =>
        AuditEntrySchema.parse({
          id: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          actorId: row.actorId,
          actorName: nameById.get(row.actorId) ?? 'Unknown',
          action: row.action,
          fromState: row.fromState,
          toState: row.toState,
          comment: row.comment,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      pageMeta(query, count),
    );
  }
}
