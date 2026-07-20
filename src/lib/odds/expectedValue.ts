/**
 * Expected value of a bet, given a fair (de-vigged) probability estimate and
 * the decimal odds being offered.
 *
 *   EV = (fair_probability * decimal_odds) - 1
 *
 * Returned as a decimal fraction (e.g. 0.045 = +4.5%), never as a bare
 * integer/percentage — callers that want a percentage should multiply by
 * 100 for display (see `evToPercent`).
 */
export function expectedValue(fairProbability: number, decimalOdds: number): number {
  if (!Number.isFinite(fairProbability) || fairProbability <= 0 || fairProbability >= 1) {
    throw new Error(`Invalid fair probability: ${fairProbability}`);
  }
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new Error(`Invalid decimal odds: ${decimalOdds}`);
  }
  return fairProbability * decimalOdds - 1;
}

export function evToPercent(ev: number): number {
  return ev * 100;
}

/** Edge = sportsbook's implied probability advantage/disadvantage vs. fair probability, as a decimal fraction. */
export function edge(fairProbability: number, bookImpliedProbability: number): number {
  return fairProbability - bookImpliedProbability;
}
