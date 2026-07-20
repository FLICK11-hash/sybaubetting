import { describe, it, expect } from "vitest";
import {
  formatAmericanOdds,
  formatDecimalOdds,
  formatPercent,
  formatSignedPercent,
  formatProbability,
  formatCurrency,
} from "@/lib/format";

describe("formatAmericanOdds", () => {
  it("prefixes positive odds with +", () => {
    expect(formatAmericanOdds(150)).toBe("+150");
  });
  it("leaves negative odds as-is", () => {
    expect(formatAmericanOdds(-115)).toBe("-115");
  });
  it("renders an em dash for null/undefined", () => {
    expect(formatAmericanOdds(null)).toBe("—");
    expect(formatAmericanOdds(undefined)).toBe("—");
  });
});

describe("formatDecimalOdds", () => {
  it("formats to two decimal places", () => {
    expect(formatDecimalOdds(1.8695)).toBe("1.87");
  });
  it("renders an em dash for null", () => {
    expect(formatDecimalOdds(null)).toBe("—");
  });
});

describe("formatPercent / formatSignedPercent", () => {
  it("formats a plain percent", () => {
    expect(formatPercent(5.4321)).toBe("5.43%");
  });
  it("signs a positive percent", () => {
    expect(formatSignedPercent(5.4)).toBe("+5.40%");
  });
  it("does not add a sign for negative percents (already has one)", () => {
    expect(formatSignedPercent(-5.4)).toBe("-5.40%");
  });
});

describe("formatProbability", () => {
  it("converts a 0-1 probability to a percent string", () => {
    expect(formatProbability(0.5238)).toBe("52.4%");
  });
});

describe("formatCurrency", () => {
  it("formats as USD", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });
});
