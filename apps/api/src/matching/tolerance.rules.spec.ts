import { DEFAULT_TOLERANCES, evaluateMatch, MatchLineInput } from './tolerance.rules';

// PRD §5.2 worked examples, 1:1 (TC-402A..H). PO line: 100 units @ $50.00.
const PO_LINE = {
  poLineId: '019787c8-0000-4000-8000-00000000feed',
  lineNo: 1,
  orderedQty: 100,
  poUnitPriceMinor: 50_00,
};

function line(overrides: Partial<MatchLineInput>): MatchLineInput {
  return {
    ...PO_LINE,
    receivedQty: 100,
    previouslyInvoicedQty: 0,
    invoicedQty: 100,
    invoiceUnitPriceMinor: 50_00,
    ...overrides,
  };
}

function run(
  l: MatchLineInput,
  opts: { taxMinor?: number; extraTotalMinor?: number; isFinal?: boolean } = {},
) {
  const tax = opts.taxMinor ?? 0;
  const backedTotal = l.invoicedQty * l.invoiceUnitPriceMinor + tax;
  return evaluateMatch({
    lines: [l],
    taxMinor: tax,
    invoiceTotalMinor: backedTotal + (opts.extraTotalMinor ?? 0),
    isFinal: opts.isFinal ?? true,
  });
}

describe('3-way match tolerance cases A–H (PRD §5.2 · TC-402A..H)', () => {
  it('Case A — exact → matched', () => {
    const result = run(line({}));
    expect(result.outcome).toBe('matched');
    expect(result.reasons).toEqual([]);
  });

  it('Case B — $50.49 (+0.98%) → matched', () => {
    const result = run(line({ invoiceUnitPriceMinor: 50_49 }));
    expect(result.outcome).toBe('matched');
  });

  it('Case C — $50.51 (+1.02%) → exception PRICE_VARIANCE', () => {
    const result = run(line({ invoiceUnitPriceMinor: 50_51 }));
    expect(result.outcome).toBe('exception');
    expect(result.reasons.map((r) => r.code)).toContain('PRICE_VARIANCE');
  });

  it('Case D — 98/98 → matched (−2% exactly within tolerance)', () => {
    const result = run(line({ receivedQty: 98, invoicedQty: 98 }));
    expect(result.outcome).toBe('matched');
  });

  it('Case E — 97/97 final settlement → exception QTY_UNDER_DELIVERY', () => {
    const result = run(line({ receivedQty: 97, invoicedQty: 97 }), { isFinal: true });
    expect(result.outcome).toBe('exception');
    expect(result.reasons.map((r) => r.code)).toContain('QTY_UNDER_DELIVERY');
  });

  it('Case F — invoiced 102 > received 100 → exception QTY_OVER_INVOICED (I-3)', () => {
    const result = run(line({ invoicedQty: 102 }));
    expect(result.outcome).toBe('exception');
    expect(result.reasons.map((r) => r.code)).toContain('QTY_OVER_INVOICED');
  });

  it('Case G — partial 50/50 cumulative → matched (FR-602)', () => {
    const result = run(line({ receivedQty: 50, invoicedQty: 50 }), { isFinal: false });
    expect(result.outcome).toBe('matched');
  });

  it('Case G continued — second partial exceeding received → QTY_OVER_INVOICED', () => {
    const result = run(line({ receivedQty: 50, previouslyInvoicedQty: 50, invoicedQty: 10 }), {
      isFinal: false,
    });
    expect(result.reasons.map((r) => r.code)).toContain('QTY_OVER_INVOICED');
  });

  it('Case H — +$30 unlisted shipping → exception TOTAL_VARIANCE (> $25 abs)', () => {
    const result = run(line({}), { extraTotalMinor: 30_00 });
    expect(result.outcome).toBe('exception');
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: 'TOTAL_VARIANCE', lineNo: null }),
    ]);
    expect(result.totalDeltaMinor).toBe(30_00);
  });
});

describe('boundaries are evaluated in integer basis points — no floats (TC-406 · I-8)', () => {
  it('price exactly +1.00% ($50.50) is within tolerance', () => {
    expect(run(line({ invoiceUnitPriceMinor: 50_50 })).outcome).toBe('matched');
  });

  it('total variance of exactly $25.00 is within tolerance', () => {
    expect(run(line({}), { extraTotalMinor: 25_00 }).outcome).toBe('matched');
    expect(run(line({}), { extraTotalMinor: 25_01 }).outcome).toBe('exception');
  });

  it('under-delivery of exactly 2% passes; a single unit more fails (final)', () => {
    expect(run(line({ receivedQty: 98, invoicedQty: 98 })).outcome).toBe('matched');
    expect(run(line({ receivedQty: 97, invoicedQty: 97 })).reasons.map((r) => r.code)).toContain(
      'QTY_UNDER_DELIVERY',
    );
  });

  it('records the tolerances used on the result (FR-405)', () => {
    expect(run(line({})).tolerances).toEqual(DEFAULT_TOLERANCES);
  });

  it('tax is part of the backed total', () => {
    const l = line({});
    const result = evaluateMatch({
      lines: [l],
      taxMinor: 500_00,
      invoiceTotalMinor: 100 * 50_00 + 500_00,
      isFinal: true,
    });
    expect(result.outcome).toBe('matched');
  });
});
