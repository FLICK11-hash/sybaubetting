import { describe, it, expect } from "vitest";
import { parsePeriodFromMarketKey, PERIODS } from "@/lib/normalization/periods";

describe("parsePeriodFromMarketKey", () => {
  it("defaults to full_game when there's no period suffix", () => {
    expect(parsePeriodFromMarketKey("totals")).toEqual({
      baseMarketKey: "totals",
      period: PERIODS.FULL_GAME,
    });
  });

  it("parses half suffixes", () => {
    expect(parsePeriodFromMarketKey("totals_h1")).toEqual({
      baseMarketKey: "totals",
      period: PERIODS.FIRST_HALF,
    });
    expect(parsePeriodFromMarketKey("spreads_h2")).toEqual({
      baseMarketKey: "spreads",
      period: PERIODS.SECOND_HALF,
    });
  });

  it("parses quarter suffixes", () => {
    expect(parsePeriodFromMarketKey("h2h_q1")).toEqual({
      baseMarketKey: "h2h",
      period: PERIODS.FIRST_QUARTER,
    });
  });

  it("parses hockey period suffixes", () => {
    expect(parsePeriodFromMarketKey("totals_p1")).toEqual({
      baseMarketKey: "totals",
      period: PERIODS.FIRST_PERIOD,
    });
  });

  it("does not confuse a full-game market with a period market of the same base key", () => {
    const fullGame = parsePeriodFromMarketKey("totals");
    const firstHalf = parsePeriodFromMarketKey("totals_h1");
    expect(fullGame.period).not.toBe(firstHalf.period);
    expect(fullGame.baseMarketKey).toBe(firstHalf.baseMarketKey);
  });
});
