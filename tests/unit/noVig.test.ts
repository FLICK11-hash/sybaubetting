import { describe, it, expect } from "vitest";
import {
  noVigProbabilities,
  noVigProbabilityTwoWay,
  noVigProbabilitiesFromDecimalOdds,
  overround,
} from "@/lib/odds/noVig";
import { decimalToImpliedProbability } from "@/lib/odds/conversion";

describe("noVigProbabilityTwoWay", () => {
  it("normalizes two raw probabilities to sum to 1", () => {
    // -110 / -110 market: both sides ~0.5238 raw, 4.76% overround
    const rawA = decimalToImpliedProbability(1.9091);
    const rawB = decimalToImpliedProbability(1.9091);
    const { fairProbabilityA, fairProbabilityB } = noVigProbabilityTwoWay(rawA, rawB);
    expect(fairProbabilityA + fairProbabilityB).toBeCloseTo(1, 6);
    expect(fairProbabilityA).toBeCloseTo(0.5, 4);
    expect(fairProbabilityB).toBeCloseTo(0.5, 4);
  });

  it("skews correctly for an uneven two-way market", () => {
    // -150 favorite vs +130 underdog
    const rawA = decimalToImpliedProbability(1.6667); // 0.6
    const rawB = decimalToImpliedProbability(2.3); // ~0.4348
    const { fairProbabilityA, fairProbabilityB } = noVigProbabilityTwoWay(rawA, rawB);
    expect(fairProbabilityA + fairProbabilityB).toBeCloseTo(1, 6);
    expect(fairProbabilityA).toBeGreaterThan(fairProbabilityB);
    expect(fairProbabilityA).toBeCloseTo(0.5794, 3);
  });
});

describe("noVigProbabilities (n-way)", () => {
  it("normalizes a 3-way soccer market", () => {
    const raw = [1 / 2.5, 1 / 3.4, 1 / 3.0]; // home/draw/away raw implied probs
    const fair = noVigProbabilities(raw);
    const sum = fair.reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(fair.length).toBe(3);
  });

  it("throws on fewer than two outcomes", () => {
    expect(() => noVigProbabilities([0.5])).toThrow();
  });

  it("throws on invalid probabilities", () => {
    expect(() => noVigProbabilities([0.5, -0.1])).toThrow();
    expect(() => noVigProbabilities([0.5, 0])).toThrow();
  });
});

describe("noVigProbabilitiesFromDecimalOdds", () => {
  it("matches manual conversion", () => {
    const fair = noVigProbabilitiesFromDecimalOdds([1.9091, 1.9091]);
    expect(fair[0]).toBeCloseTo(0.5, 4);
  });
});

describe("overround", () => {
  it("is greater than 1 for a standard vigged market", () => {
    const raw = [decimalToImpliedProbability(1.9091), decimalToImpliedProbability(1.9091)];
    expect(overround(raw)).toBeGreaterThan(1);
    expect(overround(raw)).toBeCloseTo(1.0476, 3);
  });
});
