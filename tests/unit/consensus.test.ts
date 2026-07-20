import { describe, it, expect } from "vitest";
import { consensusImpliedProbability, consensusDecimalOdds, BookPrice } from "@/lib/odds/consensus";

const prices: BookPrice[] = [
  { sportsbookId: 1, decimalOdds: 1.91 },
  { sportsbookId: 2, decimalOdds: 1.95 },
  { sportsbookId: 3, decimalOdds: 2.05 },
  { sportsbookId: 4, decimalOdds: 1.87 },
];

describe("consensusImpliedProbability (median)", () => {
  it("returns the median implied probability", () => {
    const probs = prices.map((p) => 1 / p.decimalOdds).sort((a, b) => a - b);
    const expected = (probs[1] + probs[2]) / 2;
    expect(consensusImpliedProbability(prices, "median")).toBeCloseTo(expected, 8);
  });

  it("is robust to a single extreme outlier", () => {
    const withOutlier = [...prices, { sportsbookId: 5, decimalOdds: 10.0 }];
    const medianWith = consensusImpliedProbability(withOutlier, "median");
    const medianWithout = consensusImpliedProbability(prices, "median");
    // Adding one extreme low-probability book shouldn't swing the median much
    expect(Math.abs(medianWith - medianWithout)).toBeLessThan(0.05);
  });
});

describe("consensusImpliedProbability (weighted_average)", () => {
  it("weights sharp books more heavily", () => {
    const weighted: BookPrice[] = [
      { sportsbookId: 1, decimalOdds: 2.0, weight: 3 }, // sharp book, 0.5 implied
      { sportsbookId: 2, decimalOdds: 2.5, weight: 1 }, // 0.4 implied
    ];
    const consensus = consensusImpliedProbability(weighted, "weighted_average");
    // Weighted toward 0.5 more than a plain average (0.45) would be
    expect(consensus).toBeGreaterThan(0.45);
    expect(consensus).toBeCloseTo((0.5 * 3 + 0.4 * 1) / 4, 6);
  });

  it("defaults to equal weight of 1 when unspecified", () => {
    const equal: BookPrice[] = [
      { sportsbookId: 1, decimalOdds: 2.0 },
      { sportsbookId: 2, decimalOdds: 2.5 },
    ];
    const consensus = consensusImpliedProbability(equal, "weighted_average");
    expect(consensus).toBeCloseTo((0.5 + 0.4) / 2, 6);
  });
});

describe("consensusDecimalOdds", () => {
  it("is the inverse of consensus implied probability", () => {
    const prob = consensusImpliedProbability(prices, "median");
    expect(consensusDecimalOdds(prices, "median")).toBeCloseTo(1 / prob, 8);
  });
});

describe("edge cases", () => {
  it("throws on empty price list", () => {
    expect(() => consensusImpliedProbability([], "median")).toThrow();
  });
});
