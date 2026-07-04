import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { MatrixRuleset, MatrixRulesetCreate, MatrixRulesetSchema } from '@trimatch/shared';
import { Cache } from 'cache-manager';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import { MatrixRule } from './matrix-rule.model';
import { findOverlaps } from './matrix.validate';

// The active ruleset is read on every requisition submission but only changes
// when an admin publishes a new version — an ideal cache-aside target (869dzr3k8).
const ACTIVE_RULESET_CACHE_KEY = 'matrix:active-ruleset';

@Injectable()
export class MatrixService {
  constructor(
    @InjectModel(MatrixRule) private readonly rules: typeof MatrixRule,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly audit: AuditService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async activeRuleset(): Promise<MatrixRuleset> {
    const cached = await this.cache.get<unknown>(ACTIVE_RULESET_CACHE_KEY);
    if (cached) {
      // Tolerate a stale/foreign shape (e.g. after a deploy) by treating a parse
      // failure as a miss rather than serving corrupt data.
      const parsed = MatrixRulesetSchema.safeParse(cached);
      if (parsed.success) return parsed.data;
    }
    const ruleset = await this.loadActiveRuleset();
    await this.cache.set(ACTIVE_RULESET_CACHE_KEY, ruleset);
    return ruleset;
  }

  private async loadActiveRuleset(): Promise<MatrixRuleset> {
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
    // Invalidate so the next read reloads the new version from the DB. The TTL is
    // only a backstop; publishing is the authoritative bust.
    await this.cache.del(ACTIVE_RULESET_CACHE_KEY);
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
