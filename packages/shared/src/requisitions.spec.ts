import { RequisitionCreateSchema } from './requisitions';

const valid = {
  justification: 'Monitors',
  neededBy: '2026-08-01',
  currency: 'USD',
  lines: [{ description: 'Monitor', category: 'IT', quantity: 2, unitPriceMinor: 1500 }],
};

describe('requisition create schema (mirrors TC-102 at the contract level)', () => {
  it('accepts a draft with at least one line', () => {
    expect(RequisitionCreateSchema.parse(valid).lines).toHaveLength(1);
  });

  it('rejects zero lines', () => {
    expect(() => RequisitionCreateSchema.parse({ ...valid, lines: [] })).toThrow(/one line/);
  });

  it('rejects fractional quantities and non-integer minor units (I-8)', () => {
    expect(() =>
      RequisitionCreateSchema.parse({
        ...valid,
        lines: [{ ...valid.lines[0], quantity: 1.5 }],
      }),
    ).toThrow();
    expect(() =>
      RequisitionCreateSchema.parse({
        ...valid,
        lines: [{ ...valid.lines[0], unitPriceMinor: 19.99 }],
      }),
    ).toThrow();
  });

  it('rejects a lowercase or malformed currency code', () => {
    expect(() => RequisitionCreateSchema.parse({ ...valid, currency: 'usd' })).toThrow();
    expect(() => RequisitionCreateSchema.parse({ ...valid, neededBy: 'not-a-date' })).toThrow();
  });
});
