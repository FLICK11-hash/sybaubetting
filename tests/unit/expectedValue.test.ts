import { describe, it, expect } from "vitest";
import { expectedValue, evToPercent, edge } from "@/lib/odds/expectedValue";

describe("expectedValue", () => {
  it("computes positive EV when odds exceed fair value", () => {
    // Fair probability 50%, offered decimal odds 2.10 (implies 47.6%) -> +EV
    const ev = expectedValue(0.5, 2.1);
    expect(ev).toBeCloseTo(0.05, 6);
    expect(evToPercent(ev)).toBeCloseTo(5, 4);
  });

  it("computes negative EV when odds are worse than fair value", () => {
    const ev = expectedValue(0.5, 1.9);
    expect(ev).toBeCloseTo(-0.05, 6);
  });

  it("computes zero EV at exactly fair odds", () => {
    const ev = expectedValue(0.5, 2.0);
    expect(ev).toBeCloseTo(0, 6);
  });

  it("rejects invalid fair probability", () => {
    expect(() => expectedValue(0, 2.0)).toThrow();
    expect(() => expectedValue(1, 2.0)).toThrow();
    expect(() => expectedValue(-0.1, 2.0)).toThrow();
  });

  it("rejects invalid decimal odds", () => {
    expect(() => expectedValue(0.5, 1)).toThrow();
    expect(() => expectedValue(0.5, 0.5)).toThrow();
  });
});

describe("edge", () => {
  it("is positive when fair probability exceeds book implied probability", () => {
    expect(edge(0.55, 0.5)).toBeCloseTo(0.05, 6);
  });

  it("is negative when book implied probability exceeds fair probability", () => {
    expect(edge(0.45, 0.5)).toBeCloseTo(-0.05, 6);
  });
});
