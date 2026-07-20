import { describe, it, expect } from "vitest";
import { classifyOutcomeType, OUTCOME_TYPES } from "@/lib/normalization/outcomeTypes";

describe("classifyOutcomeType", () => {
  it("classifies over/under", () => {
    expect(classifyOutcomeType({ outcomeName: "Over" })).toBe(OUTCOME_TYPES.OVER);
    expect(classifyOutcomeType({ outcomeName: "Under" })).toBe(OUTCOME_TYPES.UNDER);
  });

  it("classifies draw/tie", () => {
    expect(classifyOutcomeType({ outcomeName: "Draw" })).toBe(OUTCOME_TYPES.DRAW);
  });

  it("classifies yes/no", () => {
    expect(classifyOutcomeType({ outcomeName: "Yes" })).toBe(OUTCOME_TYPES.YES);
    expect(classifyOutcomeType({ outcomeName: "No" })).toBe(OUTCOME_TYPES.NO);
  });

  it("classifies home/away against event context, ignoring accents/case", () => {
    const params = { outcomeName: "boston celtics", homeTeamName: "Boston Celtics", awayTeamName: "Los Angeles Lakers" };
    expect(classifyOutcomeType(params)).toBe(OUTCOME_TYPES.HOME);
    expect(
      classifyOutcomeType({ ...params, outcomeName: "Los Angeles Lakers" })
    ).toBe(OUTCOME_TYPES.AWAY);
  });

  it("falls back to a generic selection for futures entrants", () => {
    expect(classifyOutcomeType({ outcomeName: "Denver Nuggets" })).toBe(OUTCOME_TYPES.SELECTION);
  });
});
