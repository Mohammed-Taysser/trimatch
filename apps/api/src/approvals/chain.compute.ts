import { MatrixRule } from '@trimatch/shared';

// FR-501: compute the ordered chain of approver titles from the active
// ruleset — pure function (architecture §3). The most specific matching base
// rule wins (department match + category match), then every matching append
// rule adds its titles (deduplicated, order preserved).

export interface ChainRequest {
  amountMinor: number;
  department: string | null;
  categories: string[];
}

type RuleLike = Pick<
  MatrixRule,
  'ruleLabel' | 'kind' | 'minAmountMinor' | 'maxAmountMinor' | 'department' | 'category' | 'chain'
>;

function amountMatches(rule: RuleLike, amountMinor: number): boolean {
  const min = rule.minAmountMinor ?? 0;
  const max = rule.maxAmountMinor ?? Number.MAX_SAFE_INTEGER;
  return amountMinor >= min && amountMinor <= max;
}

function scopeMatches(rule: RuleLike, request: ChainRequest): boolean {
  if (rule.department !== null && rule.department !== request.department) return false;
  if (rule.category !== null && !request.categories.includes(rule.category)) return false;
  return true;
}

function specificity(rule: RuleLike): number {
  return (rule.department !== null ? 2 : 0) + (rule.category !== null ? 1 : 0);
}

export function computeChain(rules: RuleLike[], request: ChainRequest): string[] {
  const bases = rules
    .filter((rule) => rule.kind === 'base')
    .filter((rule) => amountMatches(rule, request.amountMinor))
    .filter((rule) => scopeMatches(rule, request))
    .sort((a, b) => specificity(b) - specificity(a) || a.ruleLabel.localeCompare(b.ruleLabel));
  if (bases.length === 0) return [];

  const chain = [...bases[0].chain];
  const appends = rules
    .filter((rule) => rule.kind === 'append')
    .filter((rule) => amountMatches(rule, request.amountMinor))
    .filter((rule) => scopeMatches(rule, request));
  for (const rule of appends) {
    for (const title of rule.chain) {
      if (!chain.includes(title)) chain.push(title);
    }
  }
  return chain;
}
