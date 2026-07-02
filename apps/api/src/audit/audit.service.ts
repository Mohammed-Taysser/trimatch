import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
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
}
