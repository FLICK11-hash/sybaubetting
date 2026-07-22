import { describe, it, expect } from "vitest";
import { looksLikeQuotaExhausted } from "@/lib/worker/runOnDemand";

describe("looksLikeQuotaExhausted", () => {
  it("matches a 401 quota-exceeded message", () => {
    expect(
      looksLikeQuotaExhausted(
        'listEventOdds(basketball_nba): Provider request failed with status 401: {"message":"Usage quota reached, please upgrade your plan."}'
      )
    ).toBe(true);
  });

  it("matches a 429 rate-limit message mentioning credits", () => {
    expect(looksLikeQuotaExhausted("Provider request failed with status 429: out of credits")).toBe(true);
  });

  it("does not match an unrelated 500 server error", () => {
    expect(looksLikeQuotaExhausted("Provider request failed with status 500: Internal Server Error")).toBe(false);
  });

  it("does not match a transient network error with no status code", () => {
    expect(looksLikeQuotaExhausted("fetch failed: ECONNRESET")).toBe(false);
  });

  it("does not match a 404 with no quota-related wording", () => {
    expect(looksLikeQuotaExhausted("Provider request failed with status 404: page not found")).toBe(false);
  });
});
