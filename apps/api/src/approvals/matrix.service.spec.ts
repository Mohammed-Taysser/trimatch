import { Cache } from 'cache-manager';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import { MatrixRule } from './matrix-rule.model';
import { MatrixService } from './matrix.service';

// Cache-aside on the active ruleset (869dzr3k8): a hit skips the DB entirely; a
// miss (or an unparseable cached value) loads from the DB and repopulates.
function makeService(cached: unknown, dbVersion: number | null = 2) {
  const rules = {
    max: jest.fn().mockResolvedValue(dbVersion),
    findAll: jest.fn().mockResolvedValue([]),
  } as unknown as typeof MatrixRule;
  const cache = {
    get: jest.fn().mockResolvedValue(cached),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(true),
  } as unknown as Cache;
  const service = new MatrixService(rules, {} as Sequelize, {} as AuditService, cache);
  return { service, rules, cache };
}

describe('activeRuleset caches the ruleset with the DB as the source of truth', () => {
  it('returns the cached ruleset without touching the DB on a hit', async () => {
    const { service, rules, cache } = makeService({ version: 7, rules: [] });
    const result = await service.activeRuleset();
    expect(result.version).toBe(7);
    expect(rules.max).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('loads from the DB and populates the cache on a miss', async () => {
    const { service, rules, cache } = makeService(undefined, 2);
    const result = await service.activeRuleset();
    expect(result.version).toBe(2);
    expect(rules.max).toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalledWith('matrix:active-ruleset', result);
  });

  it('treats an unparseable cached value as a miss and reloads from the DB', async () => {
    const { service, rules, cache } = makeService({ not: 'a ruleset' }, 2);
    const result = await service.activeRuleset();
    expect(result.version).toBe(2);
    expect(rules.max).toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalled();
  });
});
