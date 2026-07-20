import { describe, it, expect } from "vitest";
import { detectOutliers, significantOutliers } from "@/lib/odds/outliers";
import { BookPrice } from "@/lib/odds/consensus";

describe("detectOutliers", () => {
  it("gives a positive score to a book paying out more than consensus", () => {
    const prices: BookPrice[] = [
      { sportsbookId: 1, decimalOdds: 1.91 },
      { sportsbookId: 2, decimalOdds: 1.91 },
      { sportsbookId: 3, decimalOdds: 1.91 },
      { sportsbookId: 4, decimalOdds: 2.3 }, // pays out much more -> favorable outlier
    ];
    const results = detectOutliers(prices, "median");
    const favorable = results.find((r) => r.sportsbookId === 4)!;
    expect(favorable.outlierScore).toBeGreaterThan(0);
  });

  it("gives a negative score to a book paying out less than consensus", () => {
    const prices: BookPrice[] = [
      { sportsbookId: 1, decimalOdds: 2.0 },
      { sportsbookId: 2, decimalOdds: 2.0 },
      { sportsbookId: 3, decimalOdds: 2.0 },
      { sportsbookId: 4, decimalOdds: 1.5 }, // pays out much less -> unfavorable
    ];
    const results = detectOutliers(prices, "median");
    const unfavorable = results.find((r) => r.sportsbookId === 4)!;
    expect(unfavorable.outlierScore).toBeLessThan(0);
  });

  it("gives every book a score of ~0 when all prices are identical", () => {
    const prices: BookPrice[] = [
      { sportsbookId: 1, decimalOdds: 2.0 },
      { sportsbookId: 2, decimalOdds: 2.0 },
      { sportsbookId: 3, decimalOdds: 2.0 },
    ];
    const results = detectOutliers(prices, "median");
    for (const r of results) {
      expect(r.outlierScore).toBeCloseTo(0, 6);
    }
  });

  it("does not label the best price as an outlier by itself (best price != positive EV)", () => {
    // Best price can be only marginally better than consensus -- small positive score, not automatically "+EV"
    const prices: BookPrice[] = [
      { sportsbookId: 1, decimalOdds: 1.95 },
      { sportsbookId: 2, decimalOdds: 1.94 },
      { sportsbookId: 3, decimalOdds: 1.96 }, // best price, but barely different from the rest
    ];
    const results = detectOutliers(prices, "median");
    const best = results.find((r) => r.sportsbookId === 3)!;
    expect(best.outlierScore).toBeGreaterThan(0);
    expect(best.outlierScore).toBeLessThan(2); // small, not a "meaningful" outlier
  });
});

describe("significantOutliers", () => {
  it("filters to only outliers meeting the threshold and sorts most-favorable first", () => {
    const prices: BookPrice[] = [
      { sportsbookId: 1, decimalOdds: 1.91 },
      { sportsbookId: 2, decimalOdds: 1.91 },
      { sportsbookId: 3, decimalOdds: 1.91 },
      { sportsbookId: 4, decimalOdds: 2.5 }, // big favorable outlier
      { sportsbookId: 5, decimalOdds: 1.2 }, // big unfavorable outlier
    ];
    const results = significantOutliers(prices, 10, "median");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].sportsbookId).toBe(4);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].outlierScore).toBeGreaterThanOrEqual(results[i].outlierScore);
    }
  });
});
