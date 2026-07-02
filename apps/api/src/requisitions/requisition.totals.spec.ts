import { computeTotals } from './requisition.totals';

// TC-101: totals computed in integer minor units (I-8) — table-driven.
describe('requisition totals are computed in minor units', () => {
  const line = (quantity: number, unitPriceMinor: number) => ({
    description: 'x',
    category: 'IT',
    quantity,
    unitPriceMinor,
  });

  it.each`
    lines                             | expectedTotal | case
    ${[line(2, 15_00)]}               | ${30_00}      | ${'2 × 15.00'}
    ${[line(2, 15_00), line(3, 999)]} | ${59_97}      | ${'two lines'}
    ${[line(1, 0)]}                   | ${0}          | ${'zero price'}
    ${[line(7, 1)]}                   | ${7}          | ${'smallest unit'}
  `('computes $case → $expectedTotal', ({ lines, expectedTotal }) => {
    const result = computeTotals(lines);
    expect(result.totalMinor).toBe(expectedTotal);
    expect(Number.isInteger(result.totalMinor)).toBe(true);
  });

  it('numbers lines sequentially and totals each line', () => {
    const result = computeTotals([line(2, 15_00), line(3, 999)]);
    expect(result.lines.map((l) => l.lineNo)).toEqual([1, 2]);
    expect(result.lines.map((l) => l.lineTotalMinor)).toEqual([30_00, 29_97]);
  });
});
