import { describe, it, expect } from "vitest";
import { resolveMarketTypeCode, marketTypeDefinition, MARKET_TYPE_CATALOG } from "@/lib/normalization/marketTypeCatalog";

describe("resolveMarketTypeCode", () => {
  it("resolves game markets", () => {
    expect(resolveMarketTypeCode("h2h")).toBe("MONEYLINE");
    expect(resolveMarketTypeCode("spreads")).toBe("SPREAD");
    expect(resolveMarketTypeCode("totals")).toBe("TOTAL");
  });

  it("resolves h2h to the 3-way moneyline for soccer", () => {
    expect(resolveMarketTypeCode("h2h", { isThreeWayMoneyline: true })).toBe("MONEYLINE_3WAY");
  });

  it("resolves player prop markets", () => {
    expect(resolveMarketTypeCode("player_points")).toBe("PLAYER_POINTS");
    expect(resolveMarketTypeCode("player_pass_yds")).toBe("PLAYER_PASS_YARDS");
  });

  it("resolves futures", () => {
    expect(resolveMarketTypeCode("outrights")).toBe("FUTURES_WINNER");
  });

  it("returns null for unknown keys", () => {
    expect(resolveMarketTypeCode("some_unknown_market")).toBeNull();
  });
});

describe("marketTypeDefinition", () => {
  it("has consistent metadata for every catalog entry", () => {
    for (const def of MARKET_TYPE_CATALOG) {
      expect(def.code).toBeTruthy();
      expect(["game", "player_prop", "future"]).toContain(def.category);
      expect(def.providerKeys.length).toBeGreaterThan(0);
    }
  });

  it("marks moneyline/spread/total as having the shape needed for arbitrage scanning", () => {
    const moneyline = marketTypeDefinition("MONEYLINE")!;
    expect(moneyline.expectedOutcomeCount).toBe(2);
    const soccerMoneyline = marketTypeDefinition("MONEYLINE_3WAY")!;
    expect(soccerMoneyline.expectedOutcomeCount).toBe(3);
  });

  it("excludes futures from a fixed outcome count (variable entrants)", () => {
    const futures = marketTypeDefinition("FUTURES_WINNER")!;
    expect(futures.category).toBe("future");
    expect(futures.expectedOutcomeCount).toBe(0);
  });
});
