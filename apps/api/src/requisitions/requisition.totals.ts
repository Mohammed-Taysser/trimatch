import { RequisitionLineInput } from '@trimatch/shared';

// Pure business rule (playbook §5): all arithmetic in integer minor units (I-8).
export interface ComputedLine extends RequisitionLineInput {
  lineNo: number;
  lineTotalMinor: number;
}

export interface ComputedTotals {
  lines: ComputedLine[];
  totalMinor: number;
}

export function computeTotals(lines: RequisitionLineInput[]): ComputedTotals {
  const computed = lines.map((line, index) => ({
    ...line,
    lineNo: index + 1,
    lineTotalMinor: line.quantity * line.unitPriceMinor,
  }));
  return {
    lines: computed,
    totalMinor: computed.reduce((sum, line) => sum + line.lineTotalMinor, 0),
  };
}
