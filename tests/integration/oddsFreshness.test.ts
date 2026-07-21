import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetTestDb } from "../db/testDb";
import { seedMinimalFixture } from "../db/fixtures";
import { MarketMatcher } from "@/lib/normalization/marketMatcher";
import { recalculateOutcomeOpportunities } from "@/lib/worker/opportunityCalculator";
import { recalculateMarketLineArbitrage } from "@/lib/worker/arbitrageScanner";
import { americanToDecimal, decimalToImpliedProbability, roundDecimalOdds, roundProbability } from "@/lib/odds/conversion";

const MAX_QUOTE_AGE_SECONDS = 600; // 10 minutes, matches Settings' schema default

async function createSnapshot(params: {
  outcomeId: number;
  sportsbookId: number;
  apiProviderId: number;
  americanOdds: number;
  capturedAt: Date;
}) {
  const decimalOdds = roundDecimalOdds(americanToDecimal(params.americanOdds));
  const impliedProbability = roundProbability(decimalToImpliedProbability(decimalOdds));
  return testPrisma.oddsSnapshot.create({
    data: {
      outcomeId: params.outcomeId,
      sportsbookId: params.sportsbookId,
      apiProviderId: params.apiProviderId,
      americanOdds: params.americanOdds,
      decimalOdds,
      impliedProbability,
      capturedAt: params.capturedAt,
      isCurrent: true,
    },
  });
}

async function makeSportsbook(name: string) {
  return testPrisma.sportsbook.create({ data: { name, slug: name.toLowerCase().replace(/\s+/g, "-") } });
}

describe("stale-quote exclusion (Settings.maxQuoteAgeSeconds)", () => {
  beforeEach(resetTestDb);

  it("excludes a stale snapshot from best-price/EV, even when its raw price looks better than any fresh one", async () => {
    const { provider, league, moneyline } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);
    const { eventId, homeTeamId, awayTeamId } = await matcher.resolveEvent(league.id, {
      id: "ext-1",
      commenceTime: "2026-08-01T00:00:00Z",
      homeTeam: "Celtics",
      awayTeam: "Lakers",
    });
    const targets = await matcher.resolveGameMarketOutcomes({
      eventId,
      leagueId: league.id,
      homeTeamId,
      awayTeamId,
      homeTeamName: "Celtics",
      awayTeamName: "Lakers",
      marketTypeId: moneyline.id,
      marketTypeName: "Moneyline",
      period: "full_game",
      sportsbookId: 0,
      quote: {
        key: "h2h",
        lastUpdate: new Date().toISOString(),
        outcomes: [
          { name: "Celtics", price: -150 },
          { name: "Lakers", price: 130 },
        ],
      },
    });
    const celticsOutcomeId = targets[0].outcomeId;
    const lakersOutcomeId = targets[1].outcomeId;

    const bookA = await makeSportsbook("Book A");
    const bookB = await makeSportsbook("Book B");
    const bookStale = await makeSportsbook("Book Stale");
    const lakersBook = await makeSportsbook("Lakers Book");

    // Two fresh, plausible Celtics prices.
    await createSnapshot({ outcomeId: celticsOutcomeId, sportsbookId: bookA.id, apiProviderId: provider.id, americanOdds: -150, capturedAt: new Date() });
    const freshBest = await createSnapshot({ outcomeId: celticsOutcomeId, sportsbookId: bookB.id, apiProviderId: provider.id, americanOdds: 130, capturedAt: new Date() });
    // A stale snapshot with an absurdly better price -- must NOT win "best price".
    const stale = await createSnapshot({
      outcomeId: celticsOutcomeId,
      sportsbookId: bookStale.id,
      apiProviderId: provider.id,
      americanOdds: 5000,
      capturedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours old
    });
    // A fresh price on the other side so the NO_VIG branch has something to pair against.
    await createSnapshot({ outcomeId: lakersOutcomeId, sportsbookId: lakersBook.id, apiProviderId: provider.id, americanOdds: -160, capturedAt: new Date() });

    await recalculateOutcomeOpportunities(testPrisma, celticsOutcomeId, { maxQuoteAgeSeconds: MAX_QUOTE_AGE_SECONDS });

    const staleOpportunity = await testPrisma.bettingOpportunity.findUnique({ where: { oddsSnapshotId: stale.id } });
    expect(staleOpportunity).toBeNull(); // never touched -- excluded before any calculation happened

    const bestOpportunity = await testPrisma.bettingOpportunity.findUniqueOrThrow({ where: { oddsSnapshotId: freshBest.id } });
    expect(bestOpportunity.bestPriceInMarket).toBe(true);
  });

  it("does not flag arbitrage that only exists because of a stale snapshot", async () => {
    const { provider, league, moneyline } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);
    const { eventId, homeTeamId, awayTeamId } = await matcher.resolveEvent(league.id, {
      id: "ext-2",
      commenceTime: "2026-08-01T00:00:00Z",
      homeTeam: "Celtics",
      awayTeam: "Lakers",
    });
    const targets = await matcher.resolveGameMarketOutcomes({
      eventId,
      leagueId: league.id,
      homeTeamId,
      awayTeamId,
      homeTeamName: "Celtics",
      awayTeamName: "Lakers",
      marketTypeId: moneyline.id,
      marketTypeName: "Moneyline",
      period: "full_game",
      sportsbookId: 0,
      quote: {
        key: "h2h",
        lastUpdate: new Date().toISOString(),
        outcomes: [
          { name: "Celtics", price: -150 },
          { name: "Lakers", price: 130 },
        ],
      },
    });
    const celticsOutcomeId = targets[0].outcomeId;
    const lakersOutcomeId = targets[1].outcomeId;
    const marketLineId = await testPrisma.outcome
      .findUniqueOrThrow({ where: { id: celticsOutcomeId } })
      .then((o) => o.marketLineId);

    const bookA = await makeSportsbook("Book A");
    const bookStale = await makeSportsbook("Book Stale");
    const bookB = await makeSportsbook("Book B");

    // Fresh, ordinary two-sided market -- no arbitrage (152.4% + 56.5% > 100%).
    await createSnapshot({ outcomeId: celticsOutcomeId, sportsbookId: bookA.id, apiProviderId: provider.id, americanOdds: -150, capturedAt: new Date() });
    await createSnapshot({ outcomeId: lakersOutcomeId, sportsbookId: bookB.id, apiProviderId: provider.id, americanOdds: 130, capturedAt: new Date() });
    // A stale, extremely generous Celtics price that WOULD create arbitrage if counted.
    await createSnapshot({
      outcomeId: celticsOutcomeId,
      sportsbookId: bookStale.id,
      apiProviderId: provider.id,
      americanOdds: 5000,
      capturedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    await recalculateMarketLineArbitrage(testPrisma, marketLineId, { maxQuoteAgeSeconds: MAX_QUOTE_AGE_SECONDS });

    const opportunities = await testPrisma.arbitrageOpportunity.findMany({ where: { marketLineId } });
    expect(opportunities).toHaveLength(0);
  });
});
