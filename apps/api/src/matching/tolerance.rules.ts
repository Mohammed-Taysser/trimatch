// The 3-way match rules (PRD §5.2) as a pure function: plain data in,
// verdict out. All arithmetic is integer minor units; percentage thresholds
// are evaluated as `abs(delta) * 10000 <= threshold_bp * base` — no floats
// anywhere (I-8, TC-406).

export interface ToleranceConfig {
  /** invoice unit price vs PO unit price, ± basis points (100 = 1%) */
  priceToleranceBp: number;
  /** received vs ordered under-delivery, basis points (200 = 2%) */
  qtyUnderDeliveryBp: number;
  /** invoice total vs expected billed + tax, absolute minor units */
  totalToleranceAbsMinor: number;
}

export const DEFAULT_TOLERANCES: ToleranceConfig = {
  priceToleranceBp: 100,
  qtyUnderDeliveryBp: 200,
  totalToleranceAbsMinor: 25_00,
};

export type MatchReasonCode =
  'PRICE_VARIANCE' | 'QTY_OVER_INVOICED' | 'QTY_UNDER_DELIVERY' | 'TOTAL_VARIANCE';

export interface MatchLineInput {
  poLineId: string;
  lineNo: number;
  orderedQty: number;
  poUnitPriceMinor: number;
  /** cumulative good quantity received for this PO line */
  receivedQty: number;
  /** cumulative quantity invoiced by earlier (non-rejected) invoices */
  previouslyInvoicedQty: number;
  /** quantity on the invoice under evaluation */
  invoicedQty: number;
  invoiceUnitPriceMinor: number;
}

export interface MatchReason {
  code: MatchReasonCode;
  lineNo: number | null; // null = invoice-level (TOTAL_VARIANCE)
  detail: string;
}

export interface LineComparison {
  poLineId: string;
  lineNo: number;
  orderedQty: number;
  receivedQty: number;
  cumulativeInvoicedQty: number;
  poUnitPriceMinor: number;
  invoiceUnitPriceMinor: number;
  priceDeltaBp: number; // rounded down, informational
  verdict: 'ok' | MatchReasonCode;
}

export interface MatchInput {
  lines: MatchLineInput[];
  taxMinor: number;
  invoiceTotalMinor: number;
  /**
   * Final settlement for the PO (close-short): under-delivery vs ordered is
   * only judged on final invoices — partial invoices (FR-602, case G) match
   * on cumulative rules alone. This disambiguates PRD cases E and G.
   */
  isFinal: boolean;
}

export interface MatchResult {
  outcome: 'matched' | 'exception';
  reasons: MatchReason[];
  comparisons: LineComparison[];
  expectedTotalMinor: number;
  totalDeltaMinor: number;
  tolerances: ToleranceConfig;
}

export function evaluateMatch(
  input: MatchInput,
  tolerances: ToleranceConfig = DEFAULT_TOLERANCES,
): MatchResult {
  const reasons: MatchReason[] = [];
  const comparisons: LineComparison[] = [];

  for (const line of input.lines) {
    const cumulativeInvoiced = line.previouslyInvoicedQty + line.invoicedQty;
    const priceDelta = Math.abs(line.invoiceUnitPriceMinor - line.poUnitPriceMinor);
    let verdict: LineComparison['verdict'] = 'ok';

    // I-3 / case F: cumulative invoiced may never exceed cumulative received.
    if (cumulativeInvoiced > line.receivedQty) {
      verdict = 'QTY_OVER_INVOICED';
      reasons.push({
        code: 'QTY_OVER_INVOICED',
        lineNo: line.lineNo,
        detail: `cumulative invoiced ${cumulativeInvoiced} > received ${line.receivedQty}`,
      });
    }
    // cases B/C: |Δprice| * 10000 ≤ bp * poPrice — integer comparison.
    else if (priceDelta * 10_000 > tolerances.priceToleranceBp * line.poUnitPriceMinor) {
      verdict = 'PRICE_VARIANCE';
      reasons.push({
        code: 'PRICE_VARIANCE',
        lineNo: line.lineNo,
        detail: `unit price ${line.invoiceUnitPriceMinor} vs PO ${line.poUnitPriceMinor} exceeds ±${tolerances.priceToleranceBp}bp`,
      });
    }
    // cases D/E: on a final settlement, delivery must be complete within
    // the under-delivery tolerance of the ordered quantity.
    else if (
      input.isFinal &&
      (line.orderedQty - line.receivedQty) * 10_000 >
        tolerances.qtyUnderDeliveryBp * line.orderedQty
    ) {
      verdict = 'QTY_UNDER_DELIVERY';
      reasons.push({
        code: 'QTY_UNDER_DELIVERY',
        lineNo: line.lineNo,
        detail: `received ${line.receivedQty} of ${line.orderedQty} ordered exceeds −${tolerances.qtyUnderDeliveryBp}bp under-delivery`,
      });
    }

    comparisons.push({
      poLineId: line.poLineId,
      lineNo: line.lineNo,
      orderedQty: line.orderedQty,
      receivedQty: line.receivedQty,
      cumulativeInvoicedQty: cumulativeInvoiced,
      poUnitPriceMinor: line.poUnitPriceMinor,
      invoiceUnitPriceMinor: line.invoiceUnitPriceMinor,
      priceDeltaBp:
        line.poUnitPriceMinor === 0 ? 0 : Math.floor((priceDelta * 10_000) / line.poUnitPriceMinor),
      verdict,
    });
  }

  // case H: the invoice total must be backed by its own line items + tax —
  // unlisted extras (shipping, fees) surface as TOTAL_VARIANCE. Comparing
  // against PO prices instead would wrongly fail case B (price variances are
  // the price check's job).
  const expectedTotalMinor =
    input.lines.reduce((sum, line) => sum + line.invoicedQty * line.invoiceUnitPriceMinor, 0) +
    input.taxMinor;
  const totalDeltaMinor = input.invoiceTotalMinor - expectedTotalMinor;
  if (Math.abs(totalDeltaMinor) > tolerances.totalToleranceAbsMinor) {
    reasons.push({
      code: 'TOTAL_VARIANCE',
      lineNo: null,
      detail: `invoice total ${input.invoiceTotalMinor} vs expected ${expectedTotalMinor} exceeds ±${tolerances.totalToleranceAbsMinor} minor units`,
    });
  }

  return {
    outcome: reasons.length === 0 ? 'matched' : 'exception',
    reasons,
    comparisons,
    expectedTotalMinor,
    totalDeltaMinor,
    tolerances,
  };
}
