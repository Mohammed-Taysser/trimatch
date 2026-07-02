import { formatDocNumber } from './sequences.service';

describe('document numbers follow PO-YYYY-NNNN (FR-203)', () => {
  it.each`
    type    | year    | seq      | expected
    ${'PO'} | ${2026} | ${1}     | ${'PO-2026-0001'}
    ${'PO'} | ${2026} | ${42}    | ${'PO-2026-0042'}
    ${'PO'} | ${2027} | ${1234}  | ${'PO-2027-1234'}
    ${'PO'} | ${2026} | ${10000} | ${'PO-2026-10000'}
  `('formats $type/$year/$seq → $expected', ({ type, year, seq, expected }) => {
    expect(formatDocNumber(type, year, seq)).toBe(expected);
  });
});
