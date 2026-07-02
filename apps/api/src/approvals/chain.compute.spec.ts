import { computeChain } from './chain.compute';

// Default ruleset R1–R5 exactly as seeded (PRD §5.1).
const RULES = [
  {
    ruleLabel: 'R1',
    kind: 'base' as const,
    minAmountMinor: 0,
    maxAmountMinor: 500_00,
    department: null,
    category: null,
    chain: ['Team Lead'],
  },
  {
    ruleLabel: 'R2',
    kind: 'base' as const,
    minAmountMinor: 500_01,
    maxAmountMinor: 5_000_00,
    department: null,
    category: null,
    chain: ['Team Lead', 'Department Head'],
  },
  {
    ruleLabel: 'R3',
    kind: 'base' as const,
    minAmountMinor: 5_000_01,
    maxAmountMinor: 25_000_00,
    department: null,
    category: null,
    chain: ['Team Lead', 'Department Head', 'Finance Director'],
  },
  {
    ruleLabel: 'R4',
    kind: 'base' as const,
    minAmountMinor: 25_000_01,
    maxAmountMinor: null,
    department: null,
    category: null,
    chain: ['Team Lead', 'Department Head', 'Finance Director', 'CEO'],
  },
  {
    ruleLabel: 'R5',
    kind: 'append' as const,
    minAmountMinor: null,
    maxAmountMinor: null,
    department: 'IT',
    category: 'Software licenses',
    chain: ['CISO'],
  },
];

function chainFor(
  amountMinor: number,
  department: string | null = null,
  categories: string[] = [],
) {
  return computeChain(RULES, { amountMinor, department, categories });
}

describe('chains computed from the most specific rule (FR-501 · TC-501/TC-502)', () => {
  it('TC-501: $430 → [Team Lead]', () => {
    expect(chainFor(430_00)).toEqual(['Team Lead']);
  });

  it('TC-501: $4,999.99 → [Team Lead, Department Head]', () => {
    expect(chainFor(4_999_99)).toEqual(['Team Lead', 'Department Head']);
  });

  it('TC-501: $7,200 IT / Software licenses → [Lead, Head, FinDir, CISO]', () => {
    expect(chainFor(7_200_00, 'IT', ['Software licenses'])).toEqual([
      'Team Lead',
      'Department Head',
      'Finance Director',
      'CISO',
    ]);
  });

  it('TC-502 boundary: $500.00 → R1; $500.01 → R2', () => {
    expect(chainFor(500_00)).toEqual(['Team Lead']);
    expect(chainFor(500_01)).toEqual(['Team Lead', 'Department Head']);
  });

  it('R5 does not fire outside IT / Software licenses', () => {
    expect(chainFor(7_200_00, 'Facilities', ['Software licenses'])).not.toContain('CISO');
    expect(chainFor(7_200_00, 'IT', ['Hardware'])).not.toContain('CISO');
  });

  it('> $25,000 escalates to the CEO (R4)', () => {
    expect(chainFor(80_000_00)).toEqual([
      'Team Lead',
      'Department Head',
      'Finance Director',
      'CEO',
    ]);
  });

  it('a more specific base rule beats the generic one', () => {
    const withSpecific = [
      ...RULES,
      {
        ruleLabel: 'RX',
        kind: 'base' as const,
        minAmountMinor: 0,
        maxAmountMinor: 500_00,
        department: 'IT',
        category: null,
        chain: ['CISO'],
      },
    ];
    expect(
      computeChain(withSpecific, { amountMinor: 100_00, department: 'IT', categories: [] }),
    ).toEqual(['CISO']);
  });

  it('no matching rule → empty chain (caller raises NO_APPROVER)', () => {
    expect(computeChain([], { amountMinor: 100, department: null, categories: [] })).toEqual([]);
  });
});
