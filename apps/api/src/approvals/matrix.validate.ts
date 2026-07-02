import { MatrixRuleInput } from '@trimatch/shared';

// FR-505: base-rule amount ranges must not overlap within the same
// department + category scope (TC-506). Pure function, integer minor units.
export interface MatrixOverlap {
  a: string;
  b: string;
  scope: string;
}

function scopeKey(rule: MatrixRuleInput): string {
  return `${rule.department ?? '*'} / ${rule.category ?? '*'}`;
}

function rangesOverlap(a: MatrixRuleInput, b: MatrixRuleInput): boolean {
  const aMin = a.minAmountMinor ?? 0;
  const bMin = b.minAmountMinor ?? 0;
  const aMax = a.maxAmountMinor ?? Number.MAX_SAFE_INTEGER;
  const bMax = b.maxAmountMinor ?? Number.MAX_SAFE_INTEGER;
  return aMin <= bMax && bMin <= aMax;
}

export function findOverlaps(rules: MatrixRuleInput[]): MatrixOverlap[] {
  const overlaps: MatrixOverlap[] = [];
  const base = rules.filter((rule) => rule.kind === 'base');
  for (let i = 0; i < base.length; i++) {
    for (let j = i + 1; j < base.length; j++) {
      if (scopeKey(base[i]) !== scopeKey(base[j])) continue;
      if (rangesOverlap(base[i], base[j])) {
        overlaps.push({
          a: base[i].ruleLabel,
          b: base[j].ruleLabel,
          scope: scopeKey(base[i]),
        });
      }
    }
  }
  return overlaps;
}
