export interface ArbitrageLegInput {
  /** Identifies the leg for the caller (e.g. an odds_snapshot id + sportsbook id). Opaque to this module. */
  outcomeKey: string;
  sportsbookId: number;
  decimalOdds: number;
}

export interface ArbitrageLegResult extends ArbitrageLegInput {
  impliedProbability: number;
  /** Fraction of total stake (0-1) to place on this leg so every leg returns the same profit. */
  stakePercentage: number;
  stakeAmount?: number;
}

export interface ArbitrageResult {
  isArbitrage: boolean;
  totalImpliedProbability: number;
  /** Guaranteed profit as a decimal fraction of total stake (e.g. 0.02 = 2%). */
  profitPercent: number;
  legs: ArbitrageLegResult[];
}

/**
 * Detects arbitrage across a full set of mutually exclusive outcomes for one
 * market (2-way: moneyline/spread/total; 3-way: soccer 1X2). An opportunity
 * exists when the sum of best-available implied probabilities is < 1:
 *
 *   1 / decimal_odds_A + 1 / decimal_odds_B (+ ... ) < 1
 *
 * `legs` must contain exactly one price per outcome — pass the best
 * available price per outcome (across all books) in from the caller.
 */
export function detectArbitrage(legs: ArbitrageLegInput[]): ArbitrageResult {
  if (legs.length < 2) {
    throw new Error("Arbitrage detection requires at least two outcomes");
  }
  for (const leg of legs) {
    if (!Number.isFinite(leg.decimalOdds) || leg.decimalOdds <= 1) {
      throw new Error(`Invalid decimal odds for leg ${leg.outcomeKey}: ${leg.decimalOdds}`);
    }
  }

  const impliedProbabilities = legs.map((leg) => 1 / leg.decimalOdds);
  const totalImpliedProbability = impliedProbabilities.reduce((sum, p) => sum + p, 0);
  const isArbitrage = totalImpliedProbability < 1;
  const profitPercent = isArbitrage ? 1 / totalImpliedProbability - 1 : 0;

  const legResults: ArbitrageLegResult[] = legs.map((leg, i) => ({
    ...leg,
    impliedProbability: impliedProbabilities[i],
    // Stake proportional to each leg's implied probability so every leg
    // pays out an identical total return regardless of which outcome wins.
    stakePercentage: impliedProbabilities[i] / totalImpliedProbability,
  }));

  return { isArbitrage, totalImpliedProbability, profitPercent, legs: legResults };
}

/** Attach concrete stake amounts (in currency units) given a total bankroll to allocate. */
export function allocateStakes(
  result: ArbitrageResult,
  totalStake: number
): ArbitrageLegResult[] {
  return result.legs.map((leg) => ({
    ...leg,
    stakeAmount: Math.round(leg.stakePercentage * totalStake * 100) / 100,
  }));
}
