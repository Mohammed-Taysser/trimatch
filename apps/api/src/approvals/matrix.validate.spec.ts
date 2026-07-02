import { MatrixRuleInput } from '@trimatch/shared';
import { findOverlaps } from './matrix.validate';

function rule(overrides: Partial<MatrixRuleInput>): MatrixRuleInput {
  return {
    ruleLabel: 'RX',
    kind: 'base',
    minAmountMinor: 0,
    maxAmountMinor: 500_00,
    department: null,
    category: null,
    chain: ['Team Lead'],
    ...overrides,
  };
}

// Default ruleset R1–R4 boundaries (PRD §5.1 / TC-502 boundaries).
const DEFAULTS: MatrixRuleInput[] = [
  rule({ ruleLabel: 'R1', minAmountMinor: 0, maxAmountMinor: 500_00 }),
  rule({ ruleLabel: 'R2', minAmountMinor: 500_01, maxAmountMinor: 5_000_00 }),
  rule({ ruleLabel: 'R3', minAmountMinor: 5_000_01, maxAmountMinor: 25_000_00 }),
  rule({ ruleLabel: 'R4', minAmountMinor: 25_000_01, maxAmountMinor: null }),
];

describe('matrix ruleset validation (FR-505 · TC-506)', () => {
  it('accepts the default R1–R4 ranges — contiguous, no overlap', () => {
    expect(findOverlaps(DEFAULTS)).toEqual([]);
  });

  it('flags ranges sharing a boundary cent ($500.00 in both R1 and R2)', () => {
    const clashing = [
      rule({ ruleLabel: 'R1', minAmountMinor: 0, maxAmountMinor: 500_00 }),
      rule({ ruleLabel: 'R2', minAmountMinor: 500_00, maxAmountMinor: 5_000_00 }),
    ];
    expect(findOverlaps(clashing)).toEqual([{ a: 'R1', b: 'R2', scope: '* / *' }]);
  });

  it('flags an unbounded rule swallowing another', () => {
    const clashing = [
      rule({ ruleLabel: 'R4', minAmountMinor: 25_000_01, maxAmountMinor: null }),
      rule({ ruleLabel: 'R9', minAmountMinor: 100_000_00, maxAmountMinor: null }),
    ];
    expect(findOverlaps(clashing)).toHaveLength(1);
  });

  it('different departments do not clash', () => {
    const rules = [
      rule({ ruleLabel: 'A', department: 'IT' }),
      rule({ ruleLabel: 'B', department: 'Facilities' }),
    ];
    expect(findOverlaps(rules)).toEqual([]);
  });

  it('append rules never participate in overlap checks (R5)', () => {
    const rules = [
      ...DEFAULTS,
      rule({
        ruleLabel: 'R5',
        kind: 'append',
        minAmountMinor: null,
        maxAmountMinor: null,
        department: 'IT',
        category: 'Software licenses',
        chain: ['CISO'],
      }),
    ];
    expect(findOverlaps(rules)).toEqual([]);
  });
});
