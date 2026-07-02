import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { MatrixRuleset, MatrixRulesetCreate, MatrixRulesetSchema } from '@trimatch/shared';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import { MatrixRule } from './matrix-rule.model';
import { findOverlaps } from './matrix.validate';

@Injectable()
export class MatrixService {
  constructor(
    @InjectModel(MatrixRule) private readonly rules: typeof MatrixRule,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly audit: AuditService,
  ) {}

  async activeRuleset(): Promise<MatrixRuleset> {
    const version = (await this.rules.max('version')) as number | null;
    if (!version) return MatrixRulesetSchema.parse({ version: 0, rules: [] });
    const rows = await this.rules.findAll({
      where: { version },
      order: [['ruleLabel', 'ASC']],
    });
    return MatrixRulesetSchema.parse({
      version,
      rules: rows.map((row) => this.toView(row)),
    });
  }

  // FR-505 / TC-506: a complete new ruleset becomes version N+1 after overlap
  // validation — existing versions are never touched (ADR-0002).
  async createVersion(input: MatrixRulesetCreate, actorId: string): Promise<MatrixRuleset> {
    const overlaps = findOverlaps(input.rules);
    if (overlaps.length > 0) {
      throw new UnprocessableEntityException({
        code: 'MATRIX_OVERLAP',
        message: 'Amount ranges overlap within one department/category scope',
        details: overlaps.map((o) => ({
          path: `${o.a}~${o.b}`,
          message: `rules ${o.a} and ${o.b} overlap in scope ${o.scope}`,
        })),
      });
    }
    await this.sequelize.transaction(async (transaction) => {
      const current = ((await this.rules.max('version', { transaction })) as number | null) ?? 0;
      const version = current + 1;
      await this.rules.bulkCreate(
        input.rules.map((rule) => ({ ...rule, version, createdBy: actorId })),
        { transaction },
      );
      await this.audit.record(
        {
          entityType: 'matrix',
          entityId: actorId, // ruleset has no single id; actor anchors the row
          actorId,
          action: 'matrix.version_created',
          toState: `v${version}`,
          comment: input.rules.map((r) => r.ruleLabel).join(', '),
        },
        transaction,
      );
    });
    return this.activeRuleset();
  }

  private toView(row: MatrixRule) {
    return {
      id: row.id,
      version: row.version,
      ruleLabel: row.ruleLabel,
      kind: row.kind,
      minAmountMinor: row.minAmountMinor === null ? null : Number(row.minAmountMinor),
      maxAmountMinor: row.maxAmountMinor === null ? null : Number(row.maxAmountMinor),
      department: row.department,
      category: row.category,
      chain: row.chain,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
