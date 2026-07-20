import { BookPrice, ConsensusMethod, consensusImpliedProbability } from "./consensus";

export interface OutlierResult {
  sportsbookId: number;
  decimalOdds: number;
  impliedProbability: number;
  outlierScore: number;
}

/**
 * Outlier score for each sportsbook's price relative to the market
 * consensus for one exact outcome.
 *
 * A book's implied probability *below* consensus means it's paying out
 * *more* than the rest of the market for the same outcome — favorable to
 * the bettor — so that book gets a *positive* score. A book paying out
 * less (implied probability above consensus) gets a negative score.
 *
 * outlier_score = (consensus_probability - book_probability) / consensus_probability * 100
 */
export function detectOutliers(
  prices: BookPrice[],
  method: ConsensusMethod = "median"
): OutlierResult[] {
  const consensus = consensusImpliedProbability(prices, method);
  return prices.map((p) => {
    const impliedProbability = 1 / p.decimalOdds;
    const outlierScore = ((consensus - impliedProbability) / consensus) * 100;
    return {
      sportsbookId: p.sportsbookId,
      decimalOdds: p.decimalOdds,
      impliedProbability,
      outlierScore,
    };
  });
}

/** Convenience: only the outliers whose |score| meets a threshold, sorted most-favorable first. */
export function significantOutliers(
  prices: BookPrice[],
  thresholdPercent: number,
  method: ConsensusMethod = "median"
): OutlierResult[] {
  return detectOutliers(prices, method)
    .filter((r) => Math.abs(r.outlierScore) >= thresholdPercent)
    .sort((a, b) => b.outlierScore - a.outlierScore);
}
