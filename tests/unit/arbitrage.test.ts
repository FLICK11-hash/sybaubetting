import { describe, it, expect } from "vitest";
import { detectArbitrage, allocateStakes } from "@/lib/odds/arbitrage";

describe("detectArbitrage - two-way", () => {
  it("detects a real two-way arbitrage opportunity", () => {
    // Book A: Team X +150 (2.5), Book B: Team Y +120 (2.2)
    // 1/2.5 + 1/2.2 = 0.4 + 0.4545 = 0.8545 < 1 -> arbitrage
    const result = detectArbitrage([
      { outcomeKey: "team-x", sportsbookId: 1, decimalOdds: 2.5 },
      { outcomeKey: "team-y", sportsbookId: 2, decimalOdds: 2.2 },
    ]);
    expect(result.isArbitrage).toBe(true);
    expect(result.totalImpliedProbability).toBeCloseTo(0.85455, 4);
    expect(result.profitPercent).toBeGreaterThan(0);
    expect(result.profitPercent).toBeCloseTo(1 / 0.85455 - 1, 4);
  });

  it("does not flag a normal vigged two-way market as arbitrage", () => {
    const result = detectArbitrage([
      { outcomeKey: "over", sportsbookId: 1, decimalOdds: 1.91 },
      { outcomeKey: "under", sportsbookId: 2, decimalOdds: 1.91 },
    ]);
    expect(result.isArbitrage).toBe(false);
    expect(result.totalImpliedProbability).toBeGreaterThan(1);
    expect(result.profitPercent).toBe(0);
  });

  it("allocates stakes proportional to implied probability so every leg profits equally", () => {
    const result = detectArbitrage([
      { outcomeKey: "team-x", sportsbookId: 1, decimalOdds: 2.5 },
      { outcomeKey: "team-y", sportsbookId: 2, decimalOdds: 2.2 },
    ]);
    const legs = allocateStakes(result, 1000);
    const totalStaked = legs.reduce((s, l) => s + (l.stakeAmount ?? 0), 0);
    expect(totalStaked).toBeCloseTo(1000, 0);

    const payoutX = (legs[0].stakeAmount ?? 0) * 2.5;
    const payoutY = (legs[1].stakeAmount ?? 0) * 2.2;
    expect(payoutX).toBeCloseTo(payoutY, 0);
  });
});

describe("detectArbitrage - three-way (soccer 1X2)", () => {
  it("detects a three-way arbitrage opportunity", () => {
    const result = detectArbitrage([
      { outcomeKey: "home", sportsbookId: 1, decimalOdds: 4.5 },
      { outcomeKey: "draw", sportsbookId: 2, decimalOdds: 4.0 },
      { outcomeKey: "away", sportsbookId: 3, decimalOdds: 4.5 },
    ]);
    // 1/4.5 + 1/4 + 1/4.5 = 0.2222 + 0.25 + 0.2222 = 0.6944 < 1
    expect(result.isArbitrage).toBe(true);
    expect(result.legs).toHaveLength(3);
    const totalStakePct = result.legs.reduce((s, l) => s + l.stakePercentage, 0);
    expect(totalStakePct).toBeCloseTo(1, 6);
  });

  it("does not flag a normal three-way market as arbitrage", () => {
    const result = detectArbitrage([
      { outcomeKey: "home", sportsbookId: 1, decimalOdds: 2.5 },
      { outcomeKey: "draw", sportsbookId: 2, decimalOdds: 3.4 },
      { outcomeKey: "away", sportsbookId: 3, decimalOdds: 3.0 },
    ]);
    expect(result.isArbitrage).toBe(false);
  });
});

describe("detectArbitrage - validation", () => {
  it("throws with fewer than two legs", () => {
    expect(() =>
      detectArbitrage([{ outcomeKey: "only", sportsbookId: 1, decimalOdds: 2.0 }])
    ).toThrow();
  });

  it("throws on invalid decimal odds", () => {
    expect(() =>
      detectArbitrage([
        { outcomeKey: "a", sportsbookId: 1, decimalOdds: 1.0 },
        { outcomeKey: "b", sportsbookId: 2, decimalOdds: 2.0 },
      ])
    ).toThrow();
  });
});
