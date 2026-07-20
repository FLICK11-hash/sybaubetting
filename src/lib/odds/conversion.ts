/**
 * Odds conversion utilities. Decimal odds are the canonical internal
 * representation everywhere in this app; American odds are derived/stored
 * alongside for display only. All comparison and math (best price,
 * consensus, EV, arbitrage) happens in decimal space.
 */

export class InvalidOddsError extends Error {}

/** Convert American odds (e.g. -115, +120) to decimal odds (e.g. 1.87, 2.20). */
export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) {
    throw new InvalidOddsError(`Invalid American odds: ${american}`);
  }
  if (american > 0) {
    return 1 + american / 100;
  }
  return 1 + 100 / Math.abs(american);
}

/** Convert decimal odds (e.g. 1.87) to American odds (e.g. -115). */
export function decimalToAmerican(decimal: number): number {
  if (!Number.isFinite(decimal) || decimal <= 1) {
    throw new InvalidOddsError(`Invalid decimal odds: ${decimal}`);
  }
  const profit = decimal - 1;
  if (decimal >= 2) {
    return Math.round(profit * 100);
  }
  return Math.round(-100 / profit);
}

/** Implied probability from decimal odds. Does NOT remove the vig. */
export function decimalToImpliedProbability(decimal: number): number {
  if (!Number.isFinite(decimal) || decimal <= 1) {
    throw new InvalidOddsError(`Invalid decimal odds: ${decimal}`);
  }
  return 1 / decimal;
}

/** Implied probability directly from American odds. */
export function americanToImpliedProbability(american: number): number {
  return decimalToImpliedProbability(americanToDecimal(american));
}

export function impliedProbabilityToDecimal(probability: number): number {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    throw new InvalidOddsError(`Invalid probability: ${probability}`);
  }
  return 1 / probability;
}

export function impliedProbabilityToAmerican(probability: number): number {
  return decimalToAmerican(impliedProbabilityToDecimal(probability));
}

/** Round decimal odds to the 4 decimal places stored in the database. */
export function roundDecimalOdds(decimal: number): number {
  return Math.round(decimal * 10000) / 10000;
}

/** Round a probability to the 6 decimal places stored in the database. */
export function roundProbability(probability: number): number {
  return Math.round(probability * 1_000_000) / 1_000_000;
}
