import { describe, it, expect } from "vitest";
import {
  americanToDecimal,
  decimalToAmerican,
  decimalToImpliedProbability,
  americanToImpliedProbability,
  impliedProbabilityToDecimal,
  impliedProbabilityToAmerican,
  InvalidOddsError,
} from "@/lib/odds/conversion";

describe("americanToDecimal", () => {
  it("converts positive American odds", () => {
    expect(americanToDecimal(100)).toBeCloseTo(2.0, 4);
    expect(americanToDecimal(120)).toBeCloseTo(2.2, 4);
    expect(americanToDecimal(250)).toBeCloseTo(3.5, 4);
  });

  it("converts negative American odds", () => {
    expect(americanToDecimal(-110)).toBeCloseTo(1.9091, 4);
    expect(americanToDecimal(-200)).toBeCloseTo(1.5, 4);
    expect(americanToDecimal(-115)).toBeCloseTo(1.8696, 4);
  });

  it("rejects zero or non-finite input", () => {
    expect(() => americanToDecimal(0)).toThrow(InvalidOddsError);
    expect(() => americanToDecimal(NaN)).toThrow(InvalidOddsError);
  });
});

describe("decimalToAmerican", () => {
  it("converts decimal >= 2.0 to positive American", () => {
    expect(decimalToAmerican(2.0)).toBe(100);
    expect(decimalToAmerican(3.5)).toBe(250);
  });

  it("converts decimal < 2.0 to negative American", () => {
    expect(decimalToAmerican(1.9091)).toBe(-110);
    expect(decimalToAmerican(1.5)).toBe(-200);
  });

  it("round-trips through americanToDecimal", () => {
    for (const american of [-350, -200, -115, -110, 100, 120, 250, 400]) {
      const decimal = americanToDecimal(american);
      expect(decimalToAmerican(decimal)).toBe(american);
    }
  });

  it("rejects decimal odds <= 1", () => {
    expect(() => decimalToAmerican(1)).toThrow(InvalidOddsError);
    expect(() => decimalToAmerican(0.5)).toThrow(InvalidOddsError);
  });
});

describe("implied probability conversions", () => {
  it("computes implied probability from decimal odds", () => {
    expect(decimalToImpliedProbability(2.0)).toBeCloseTo(0.5, 6);
    expect(decimalToImpliedProbability(1.9091)).toBeCloseTo(0.52381, 4);
  });

  it("computes implied probability from American odds", () => {
    expect(americanToImpliedProbability(100)).toBeCloseTo(0.5, 4);
    expect(americanToImpliedProbability(-110)).toBeCloseTo(0.52381, 4);
  });

  it("round-trips probability <-> decimal odds", () => {
    const decimal = impliedProbabilityToDecimal(0.5238);
    expect(decimalToImpliedProbability(decimal)).toBeCloseTo(0.5238, 3);
  });

  it("converts probability to American odds", () => {
    expect(impliedProbabilityToAmerican(0.5)).toBe(100);
  });

  it("rejects probabilities outside (0, 1)", () => {
    expect(() => impliedProbabilityToDecimal(0)).toThrow(InvalidOddsError);
    expect(() => impliedProbabilityToDecimal(1)).toThrow(InvalidOddsError);
    expect(() => impliedProbabilityToDecimal(-0.1)).toThrow(InvalidOddsError);
  });
});
