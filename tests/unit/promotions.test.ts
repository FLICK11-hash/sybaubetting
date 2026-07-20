import { describe, it, expect } from "vitest";
import {
  evaluatePromotion,
  qualifiesForPromotion,
  promotionIsActive,
  rankPromotionOpportunities,
  PromotionInput,
  BetInput,
} from "@/lib/promotions/calculator";

const bet: BetInput = { stake: 100, decimalOdds: 2.0, fairProbability: 0.5 };

describe("promotionIsActive", () => {
  it("is false when inactive", () => {
    expect(
      promotionIsActive({
        promotionType: "PROFIT_BOOST",
        stakeReturned: false,
        active: false,
      })
    ).toBe(false);
  });

  it("is false before startsAt or after expiresAt", () => {
    const now = new Date("2026-07-20T12:00:00Z");
    const promo: PromotionInput = {
      promotionType: "PROFIT_BOOST",
      stakeReturned: false,
      active: true,
      startsAt: new Date("2026-07-21T00:00:00Z"),
    };
    expect(promotionIsActive(promo, now)).toBe(false);

    const expired: PromotionInput = {
      promotionType: "PROFIT_BOOST",
      stakeReturned: false,
      active: true,
      expiresAt: new Date("2026-07-19T00:00:00Z"),
    };
    expect(promotionIsActive(expired, now)).toBe(false);
  });
});

describe("qualifiesForPromotion", () => {
  it("rejects odds outside min/max range", () => {
    const promo: PromotionInput = {
      promotionType: "ODDS_BOOST",
      stakeReturned: false,
      active: true,
      minDecimalOdds: 2.5,
    };
    expect(qualifiesForPromotion(promo, bet).qualifies).toBe(false);
  });

  it("rejects stake above max stake", () => {
    const promo: PromotionInput = {
      promotionType: "ODDS_BOOST",
      stakeReturned: false,
      active: true,
      maxStake: 50,
    };
    expect(qualifiesForPromotion(promo, bet).qualifies).toBe(false);
  });

  it("accepts a qualifying bet", () => {
    const promo: PromotionInput = {
      promotionType: "ODDS_BOOST",
      stakeReturned: false,
      active: true,
      minDecimalOdds: 1.5,
      maxDecimalOdds: 5,
      maxStake: 200,
    };
    expect(qualifiesForPromotion(promo, bet).qualifies).toBe(true);
  });
});

describe("evaluatePromotion - PROFIT_BOOST", () => {
  it("boosts the profit portion, not the stake", () => {
    const promo: PromotionInput = {
      promotionType: "PROFIT_BOOST",
      boostPercent: 25,
      stakeReturned: false,
      active: true,
    };
    const result = evaluatePromotion(promo, bet);
    // base profit = 1.0 (decimalOdds 2.0), boosted by 25% -> 1.25 profit -> boosted decimal 2.25
    expect(result.boostedDecimalOdds).toBeCloseTo(2.25, 6);
    expect(result.qualifies).toBe(true);
  });
});

describe("evaluatePromotion - BONUS_BET", () => {
  it("has no downside risk on the stake itself", () => {
    const promo: PromotionInput = {
      promotionType: "BONUS_BET",
      stakeReturned: false,
      active: true,
    };
    const result = evaluatePromotion(promo, bet);
    // profitIfWin = (2.0-1)*100 = 100; EV = 0.5*100 = 50
    expect(result.expectedProfit).toBeCloseTo(50, 6);
  });

  it("has higher EV than an equivalent cash wager at the same fair probability/odds", () => {
    const bonusPromo: PromotionInput = {
      promotionType: "BONUS_BET",
      stakeReturned: false,
      active: true,
    };
    const bonusResult = evaluatePromotion(bonusPromo, bet);

    // Equivalent plain cash wager EV = fairProb*decimalOdds - 1, scaled by stake
    const cashEv = (bet.fairProbability * bet.decimalOdds - 1) * bet.stake;
    expect(bonusResult.expectedProfit).toBeGreaterThan(cashEv);
  });
});

describe("evaluatePromotion - NO_SWEAT", () => {
  it("reduces downside via stake-returned refund", () => {
    const noSweat: PromotionInput = {
      promotionType: "NO_SWEAT",
      stakeReturned: true,
      active: true,
    };
    const noRefund: PromotionInput = {
      promotionType: "NO_SWEAT",
      stakeReturned: false,
      active: true,
    };
    const withRefund = evaluatePromotion(noSweat, bet, { bonusBetConversionRate: 0.7 });
    const withoutRefund = evaluatePromotion(noRefund, bet);
    expect(withRefund.expectedProfit).toBeGreaterThan(withoutRefund.expectedProfit);
  });
});

describe("evaluatePromotion - disqualified bet still returns a computed evaluation", () => {
  it("marks qualifies=false but still computes numbers for display", () => {
    const promo: PromotionInput = {
      promotionType: "ODDS_BOOST",
      boostPercent: 10,
      stakeReturned: false,
      active: true,
      minDecimalOdds: 3.0,
    };
    const result = evaluatePromotion(promo, bet);
    expect(result.qualifies).toBe(false);
    expect(result.disqualifiedReason).toBeDefined();
  });
});

describe("rankPromotionOpportunities", () => {
  it("sorts qualifying opportunities by expected profit, best first, and excludes disqualified ones", () => {
    const promoA: PromotionInput = {
      promotionType: "PROFIT_BOOST",
      boostPercent: 50,
      stakeReturned: false,
      active: true,
    };
    const promoB: PromotionInput = {
      promotionType: "PROFIT_BOOST",
      boostPercent: 10,
      stakeReturned: false,
      active: true,
    };
    const promoC: PromotionInput = {
      promotionType: "PROFIT_BOOST",
      boostPercent: 10,
      stakeReturned: false,
      active: true,
      minDecimalOdds: 10, // disqualifies
    };
    const ranked = rankPromotionOpportunities([
      { key: "A", promo: promoA, bet },
      { key: "B", promo: promoB, bet },
      { key: "C", promo: promoC, bet },
    ]);
    expect(ranked.map((r) => r.key)).toEqual(["A", "B"]);
  });
});
