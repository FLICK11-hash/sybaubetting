import { describe, it, expect } from "vitest";
import { findBestPrice, isBestPrice } from "@/lib/odds/bestPrice";
import { BookPrice } from "@/lib/odds/consensus";

// Example from the spec: DraftKings -115, FanDuel +100, BetMGM -105
// -115 -> 1.8696, +100 -> 2.00, -105 -> 1.9524
const draftKings: BookPrice = { sportsbookId: 1, decimalOdds: 1.8696 };
const fanDuel: BookPrice = { sportsbookId: 2, decimalOdds: 2.0 };
const betMgm: BookPrice = { sportsbookId: 3, decimalOdds: 1.9524 };

describe("findBestPrice", () => {
  it("picks FanDuel as best price in the spec example", () => {
    const best = findBestPrice([draftKings, fanDuel, betMgm]);
    expect(best?.sportsbookId).toBe(2);
  });

  it("returns null for an empty list", () => {
    expect(findBestPrice([])).toBeNull();
  });

  it("does not compare odds as strings", () => {
    // String comparison would put "1.9" before "1.87" incorrectly; verify numeric ordering
    const prices: BookPrice[] = [
      { sportsbookId: 1, decimalOdds: 1.9 },
      { sportsbookId: 2, decimalOdds: 1.87 },
      { sportsbookId: 3, decimalOdds: 10.0 },
    ];
    expect(findBestPrice(prices)?.sportsbookId).toBe(3);
  });
});

describe("isBestPrice", () => {
  it("flags FanDuel as best and the others as not best", () => {
    const all = [draftKings, fanDuel, betMgm];
    expect(isBestPrice(fanDuel, all)).toBe(true);
    expect(isBestPrice(draftKings, all)).toBe(false);
    expect(isBestPrice(betMgm, all)).toBe(false);
  });

  it("treats ties as best", () => {
    const all: BookPrice[] = [
      { sportsbookId: 1, decimalOdds: 2.0 },
      { sportsbookId: 2, decimalOdds: 2.0 },
    ];
    expect(isBestPrice(all[0], all)).toBe(true);
    expect(isBestPrice(all[1], all)).toBe(true);
  });
});
