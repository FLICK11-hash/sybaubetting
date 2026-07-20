import { decimalToImpliedProbability } from "./conversion";

/**
 * No-vig (de-vigged) fair probability, normalizing across all raw implied
 * probabilities for an exhaustive, mutually-exclusive set of outcomes. For a
 * two-outcome market this is exactly:
 *
 *   fair_probability_A = raw_probability_A / (raw_probability_A + raw_probability_B)
 *
 * generalized here to N outcomes.
 */
export function noVigProbabilities(rawProbabilities: number[]): number[] {
  if (rawProbabilities.length < 2) {
    throw new Error("No-vig calculation requires at least two outcomes");
  }
  for (const p of rawProbabilities) {
    if (!Number.isFinite(p) || p <= 0) {
      throw new Error(`Invalid raw probability: ${p}`);
    }
  }
  const overround = rawProbabilities.reduce((sum, p) => sum + p, 0);
  return rawProbabilities.map((p) => p / overround);
}

/** Convenience wrapper taking decimal odds for each outcome instead of probabilities. */
export function noVigProbabilitiesFromDecimalOdds(decimalOdds: number[]): number[] {
  return noVigProbabilities(decimalOdds.map(decimalToImpliedProbability));
}

/**
 * The two-outcome case called out explicitly in the spec, kept as a distinct
 * named function for clarity at call sites (e.g. moneyline, over/under).
 */
export function noVigProbabilityTwoWay(
  rawProbabilityA: number,
  rawProbabilityB: number
): { fairProbabilityA: number; fairProbabilityB: number } {
  const [fairProbabilityA, fairProbabilityB] = noVigProbabilities([
    rawProbabilityA,
    rawProbabilityB,
  ]);
  return { fairProbabilityA, fairProbabilityB };
}

/** The overround (sum of raw implied probabilities) — the market's total vig. Always >= 1 for a book to profit. */
export function overround(rawProbabilities: number[]): number {
  return rawProbabilities.reduce((sum, p) => sum + p, 0);
}
