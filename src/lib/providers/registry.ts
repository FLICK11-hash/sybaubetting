import { OddsProvider } from "./types";
import { TheOddsApiProvider } from "./theOddsApi";
import { MockOddsProvider } from "./mock";

/**
 * Central place that turns environment configuration into a live
 * `OddsProvider`. Adding a new provider (SportsGameOdds, SportsDataIO, ...)
 * means writing one class implementing `OddsProvider` and adding one case
 * here — nothing else in the app changes.
 */
export function createProvider(): OddsProvider {
  const providerSlug = process.env.ODDS_API_PROVIDER ?? "the-odds-api";
  const apiKey = process.env.ODDS_API_KEY;

  switch (providerSlug) {
    case "the-odds-api": {
      if (!apiKey) {
        // No key configured (fresh clone, local dev) — fall back to the
        // mock provider rather than crash, so `npm run dev` and the worker
        // still produce a usable dataset out of the box.
        return new MockOddsProvider();
      }
      return new TheOddsApiProvider({ apiKey });
    }
    case "mock-provider":
      return new MockOddsProvider();
    default:
      throw new Error(`Unknown ODDS_API_PROVIDER: ${providerSlug}`);
  }
}
