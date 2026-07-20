export interface BookPrice {
  sportsbookId: number;
  decimalOdds: number;
  /** Weight used only by the "weighted" method; ignored by "median". Defaults to 1. */
  weight?: number;
}

export type ConsensusMethod = "median" | "weighted_average";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Market consensus implied probability across all current sportsbook prices
 * for one exact outcome. Median is the default (robust to single-book
 * outliers); weighted average is available when the caller wants to bias
 * toward specific books (e.g. sharp books weighted higher).
 */
export function consensusImpliedProbability(
  prices: BookPrice[],
  method: ConsensusMethod = "median"
): number {
  if (prices.length === 0) {
    throw new Error("Cannot compute consensus from zero prices");
  }
  const probabilities = prices.map((p) => 1 / p.decimalOdds);

  if (method === "median") {
    return median(probabilities);
  }

  const totalWeight = prices.reduce((sum, p) => sum + (p.weight ?? 1), 0);
  if (totalWeight <= 0) {
    throw new Error("Total weight must be positive for weighted average consensus");
  }
  return prices.reduce((sum, p, i) => sum + probabilities[i] * (p.weight ?? 1), 0) / totalWeight;
}

export function consensusDecimalOdds(
  prices: BookPrice[],
  method: ConsensusMethod = "median"
): number {
  return 1 / consensusImpliedProbability(prices, method);
}
