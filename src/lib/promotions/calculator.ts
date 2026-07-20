/**
 * Promotion EV calculator. Bonus-bet-style promotions (BONUS_BET,
 * DEPOSIT_BONUS, BET_CREDIT, and the loss-side of NO_SWEAT) pay out
 * differently than a normal cash wager: the stake itself isn't returned on
 * a win, and bonus bets typically convert to less than 100% of face value
 * when redeemed. `DEFAULT_BONUS_BET_CONVERSION_RATE` documents that
 * industry-standard assumption; callers may override it.
 */
export const DEFAULT_BONUS_BET_CONVERSION_RATE = 0.7;

export type PromotionType =
  | "PROFIT_BOOST"
  | "BONUS_BET"
  | "NO_SWEAT"
  | "ODDS_BOOST"
  | "DEPOSIT_BONUS"
  | "BET_CREDIT";

export interface PromotionInput {
  promotionType: PromotionType;
  boostPercent?: number | null;
  maxStake?: number | null;
  minDecimalOdds?: number | null;
  maxDecimalOdds?: number | null;
  stakeReturned: boolean;
  active: boolean;
  startsAt?: Date | null;
  expiresAt?: Date | null;
}

export interface BetInput {
  stake: number;
  decimalOdds: number;
  fairProbability: number;
}

export interface PromotionEvaluation {
  qualifies: boolean;
  disqualifiedReason?: string;
  boostedDecimalOdds: number;
  expectedProfit: number;
  expectedValuePercent: number;
}

export function promotionIsActive(promo: PromotionInput, now: Date = new Date()): boolean {
  if (!promo.active) return false;
  if (promo.startsAt && now < promo.startsAt) return false;
  if (promo.expiresAt && now >= promo.expiresAt) return false;
  return true;
}

export function qualifiesForPromotion(
  promo: PromotionInput,
  bet: BetInput,
  now: Date = new Date()
): { qualifies: boolean; reason?: string } {
  if (!promotionIsActive(promo, now)) {
    return { qualifies: false, reason: "Promotion is not active" };
  }
  if (promo.minDecimalOdds != null && bet.decimalOdds < promo.minDecimalOdds) {
    return { qualifies: false, reason: "Odds below minimum qualifying odds" };
  }
  if (promo.maxDecimalOdds != null && bet.decimalOdds > promo.maxDecimalOdds) {
    return { qualifies: false, reason: "Odds above maximum qualifying odds" };
  }
  if (promo.maxStake != null && bet.stake > promo.maxStake) {
    return { qualifies: false, reason: "Stake exceeds promotion max stake" };
  }
  return { qualifies: true };
}

/**
 * Evaluate the expected profit/EV of applying a promotion to a candidate
 * bet. `bet.fairProbability` should come from the fair-probability
 * estimation layer (no-vig / sharp / consensus / custom), not the
 * sportsbook's own implied probability.
 */
export function evaluatePromotion(
  promo: PromotionInput,
  bet: BetInput,
  options: { bonusBetConversionRate?: number; now?: Date } = {}
): PromotionEvaluation {
  const now = options.now ?? new Date();
  const conversionRate = options.bonusBetConversionRate ?? DEFAULT_BONUS_BET_CONVERSION_RATE;
  const { qualifies, reason } = qualifiesForPromotion(promo, bet, now);

  const boostFraction = (promo.boostPercent ?? 0) / 100;
  const { stake, decimalOdds, fairProbability } = bet;

  let boostedDecimalOdds = decimalOdds;
  let expectedProfit: number;

  switch (promo.promotionType) {
    case "PROFIT_BOOST":
    case "ODDS_BOOST": {
      // Boost applies to the profit portion of the payout, not the stake.
      const baseProfit = decimalOdds - 1;
      const boostedProfit = baseProfit * (1 + boostFraction);
      boostedDecimalOdds = 1 + boostedProfit;
      expectedProfit =
        fairProbability * boostedProfit * stake - (1 - fairProbability) * stake;
      break;
    }
    case "BONUS_BET": {
      // Free bet: stake is the house's money. Win pays profit only; a loss
      // costs the bettor nothing (they never risked real cash).
      const profitIfWin = (decimalOdds - 1) * stake;
      expectedProfit = fairProbability * profitIfWin;
      break;
    }
    case "NO_SWEAT": {
      // Real cash stake. On a loss, stake is refunded as a bonus bet worth
      // `conversionRate` of face value (per stakeReturned flag).
      const profitIfWin = (decimalOdds - 1) * stake;
      const refundIfLose = promo.stakeReturned ? stake * conversionRate : 0;
      expectedProfit =
        fairProbability * profitIfWin - (1 - fairProbability) * (stake - refundIfLose);
      break;
    }
    case "DEPOSIT_BONUS":
    case "BET_CREDIT": {
      // Treated like a bonus bet for EV purposes: the credited amount is
      // house money, only profit is realized on a win.
      const profitIfWin = (decimalOdds - 1) * stake;
      expectedProfit = fairProbability * profitIfWin;
      break;
    }
    default: {
      const exhaustiveCheck: never = promo.promotionType;
      throw new Error(`Unhandled promotion type: ${exhaustiveCheck}`);
    }
  }

  const expectedValuePercent = stake > 0 ? (expectedProfit / stake) * 100 : 0;

  return {
    qualifies,
    disqualifiedReason: reason,
    boostedDecimalOdds,
    expectedProfit,
    expectedValuePercent,
  };
}

/** Rank multiple (promotion, bet) pairs by expected profit, best first. Disqualified pairs are excluded. */
export function rankPromotionOpportunities(
  pairs: Array<{ promo: PromotionInput; bet: BetInput; key: string }>,
  options?: { bonusBetConversionRate?: number; now?: Date }
): Array<{ key: string; evaluation: PromotionEvaluation }> {
  return pairs
    .map(({ promo, bet, key }) => ({ key, evaluation: evaluatePromotion(promo, bet, options) }))
    .filter((r) => r.evaluation.qualifies)
    .sort((a, b) => b.evaluation.expectedProfit - a.evaluation.expectedProfit);
}
