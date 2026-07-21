import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetTestDb } from "../db/testDb";
import { MockOddsProvider } from "@/lib/providers/mock";
import { runWorkerCycle } from "@/lib/worker/runCycle";
import { MARKET_TYPE_CATALOG } from "@/lib/normalization/marketTypeCatalog";
import { NBA_TEAMS } from "@/lib/seedData/nbaTeams";
import type { OddsProvider, ProviderEventOdds, RateLimitInfo } from "@/lib/providers/types";

/** Minimal stub provider returning a fixed, caller-supplied list of events -- lets tests control commenceTime precisely. */
class FixedEventsProvider implements OddsProvider {
  readonly slug = "fixed-events-provider";
  readonly name = "Fixed Events Provider";
  constructor(private events: ProviderEventOdds[]) {}
  async listSports() {
    return [];
  }
  async listEventOdds() {
    return this.events;
  }
  async listPlayerPropOdds() {
    return null;
  }
  async listFuturesOdds() {
    return [];
  }
  getLastRateLimitInfo(): RateLimitInfo {
    return { requestsRemaining: null, requestsUsed: null };
  }
}

function moneylineEvent(id: string, commenceTime: string): ProviderEventOdds {
  return {
    id,
    sportKey: "basketball_nba",
    commenceTime,
    homeTeam: "Celtics",
    awayTeam: "Lakers",
    bookmakers: [
      {
        key: "draftkings",
        title: "DraftKings",
        lastUpdate: new Date().toISOString(),
        markets: [
          {
            key: "h2h",
            lastUpdate: new Date().toISOString(),
            outcomes: [
              { name: "Celtics", price: -150 },
              { name: "Lakers", price: 130 },
            ],
          },
        ],
      },
    ],
  };
}

/** Minimal seed sufficient for the mock provider's NBA slate to ingest end-to-end. */
async function seedForWorker() {
  const provider = await testPrisma.apiProvider.create({
    data: { name: "Mock Odds Provider", slug: "mock-provider", baseUrl: "local://mock" },
  });
  const sport = await testPrisma.sport.create({ data: { name: "Basketball", slug: "basketball" } });
  const league = await testPrisma.league.create({
    data: { sportId: sport.id, name: "NBA", abbreviation: "NBA", countryCode: "US" },
  });
  await testPrisma.providerLeague.create({
    data: { apiProviderId: provider.id, leagueId: league.id, externalLeagueKey: "basketball_nba" },
  });

  for (const team of NBA_TEAMS) {
    await testPrisma.team.create({
      data: { leagueId: league.id, name: team.name, city: team.city, abbreviation: team.abbreviation },
    });
  }

  const books = [
    { name: "DraftKings", slug: "draftkings", key: "draftkings", isSharp: false },
    { name: "FanDuel", slug: "fanduel", key: "fanduel", isSharp: false },
    { name: "BetMGM", slug: "betmgm", key: "betmgm", isSharp: false },
  ];
  for (const b of books) {
    const sb = await testPrisma.sportsbook.create({ data: { name: b.name, slug: b.slug, isSharp: b.isSharp } });
    await testPrisma.providerSportsbook.create({
      data: { apiProviderId: provider.id, sportsbookId: sb.id, externalSportsbookId: b.key },
    });
  }

  for (const def of MARKET_TYPE_CATALOG) {
    const marketType = await testPrisma.marketType.create({
      data: {
        code: def.code,
        name: def.name,
        category: def.category,
        hasLine: def.hasLine,
        expectedOutcomeCount: def.expectedOutcomeCount,
      },
    });
    for (const key of def.providerKeys) {
      // "h2h" is shared by MONEYLINE and MONEYLINE_3WAY (disambiguated dynamically
      // by outcome count, not by this mapping table) -- skip the second insert.
      await testPrisma.providerMarketType.createMany({
        data: [{ apiProviderId: provider.id, marketTypeId: marketType.id, externalMarketKey: key }],
        skipDuplicates: true,
      });
    }
  }

  return { provider, league };
}

describe("runWorkerCycle (mock provider, real Postgres)", () => {
  beforeEach(resetTestDb);

  it("ingests game odds + player props + futures and computes opportunities end-to-end", async () => {
    const { provider } = await seedForWorker();
    const mockProvider = new MockOddsProvider();

    const result = await runWorkerCycle(testPrisma, mockProvider, provider.id);

    expect(result.errors).toEqual([]);
    expect(result.eventsProcessed).toBeGreaterThan(0);
    expect(result.snapshotsWritten).toBeGreaterThan(0);

    const events = await testPrisma.event.findMany();
    expect(events).toHaveLength(1); // Lakers @ Celtics

    const markets = await testPrisma.market.findMany();
    // moneyline, spread, total, player_points (one market shared across the single 25.5 line), futures winner
    expect(markets.length).toBeGreaterThanOrEqual(4);

    const bettingOpportunities = await testPrisma.bettingOpportunity.findMany();
    expect(bettingOpportunities.length).toBeGreaterThan(0);
    for (const opp of bettingOpportunities) {
      expect(opp.expectedValuePercent).not.toBeNull();
    }
  });

  it("is idempotent: running twice does not duplicate snapshots or markets", async () => {
    const { provider } = await seedForWorker();
    const mockProvider = new MockOddsProvider();

    await runWorkerCycle(testPrisma, mockProvider, provider.id);
    const snapshotsAfterFirst = await testPrisma.oddsSnapshot.count();
    const marketsAfterFirst = await testPrisma.market.count();

    const second = await runWorkerCycle(testPrisma, mockProvider, provider.id);

    expect(second.snapshotsWritten).toBe(0);
    const snapshotsAfterSecond = await testPrisma.oddsSnapshot.count();
    const marketsAfterSecond = await testPrisma.market.count();
    expect(snapshotsAfterSecond).toBe(snapshotsAfterFirst);
    expect(marketsAfterSecond).toBe(marketsAfterFirst);
  });

  it("never leaves more than one is_current snapshot per (outcome, sportsbook), across repeated cycles", async () => {
    const { provider } = await seedForWorker();
    const mockProvider = new MockOddsProvider();

    await runWorkerCycle(testPrisma, mockProvider, provider.id);
    await runWorkerCycle(testPrisma, mockProvider, provider.id);
    await runWorkerCycle(testPrisma, mockProvider, provider.id);

    const currentSnapshots = await testPrisma.oddsSnapshot.findMany({ where: { isCurrent: true } });
    const seen = new Set<string>();
    for (const snap of currentSnapshots) {
      const key = `${snap.outcomeId}:${snap.sportsbookId}`;
      expect(seen.has(key)).toBe(false); // would indicate a duplicate "current" pointer
      seen.add(key);
    }
    expect(currentSnapshots.length).toBeGreaterThan(0);
  });

  it("marks the best price among sportsbooks correctly (matches the spec's FanDuel example)", async () => {
    const { provider } = await seedForWorker();
    const mockProvider = new MockOddsProvider();
    await runWorkerCycle(testPrisma, mockProvider, provider.id);

    // Player points 25.5 Over: DraftKings -115, FanDuel +100, BetMGM -105 -> FanDuel is best.
    const overOutcome = await testPrisma.outcome.findFirstOrThrow({
      where: { normalizedLabel: "over", marketLine: { lineValue: 25.5 } },
    });
    const fanDuel = await testPrisma.sportsbook.findFirstOrThrow({ where: { slug: "fanduel" } });
    const fanDuelSnapshot = await testPrisma.oddsSnapshot.findFirstOrThrow({
      where: { outcomeId: overOutcome.id, sportsbookId: fanDuel.id, isCurrent: true },
    });
    const opportunity = await testPrisma.bettingOpportunity.findUniqueOrThrow({
      where: { oddsSnapshotId: fanDuelSnapshot.id },
    });
    expect(opportunity.bestPriceInMarket).toBe(true);
  });

  it("keeps the 25.5 and 26.5 player-point lines as separate, non-comparable markets", async () => {
    const { provider } = await seedForWorker();
    const mockProvider = new MockOddsProvider();
    await runWorkerCycle(testPrisma, mockProvider, provider.id);

    const lines = await testPrisma.marketLine.findMany({
      where: { market: { marketType: { code: "PLAYER_POINTS" } } },
    });
    const lineValues = lines.map((l) => Number(l.lineValue)).sort((a, b) => a - b);
    expect(lineValues).toEqual([25.5, 26.5]);
  });

  it("does not ingest a game that has already started", async () => {
    const { provider } = await seedForWorker();
    const pastCommenceTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // started an hour ago
    const fakeProvider = new FixedEventsProvider([moneylineEvent("live-game-1", pastCommenceTime)]);

    const result = await runWorkerCycle(testPrisma, fakeProvider, provider.id, {
      includePlayerProps: false,
      includeFutures: false,
    });

    expect(result.errors).toEqual([]);
    expect(result.eventsProcessed).toBe(0);
    expect(result.snapshotsWritten).toBe(0);
    const events = await testPrisma.event.findMany();
    expect(events).toHaveLength(0);
  });

  it("does not ingest a game starting more than a week from now", async () => {
    const { provider } = await seedForWorker();
    const farFutureCommenceTime = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 2 weeks out
    const fakeProvider = new FixedEventsProvider([moneylineEvent("far-future-game", farFutureCommenceTime)]);

    const result = await runWorkerCycle(testPrisma, fakeProvider, provider.id, {
      includePlayerProps: false,
      includeFutures: false,
    });

    expect(result.errors).toEqual([]);
    expect(result.eventsProcessed).toBe(0);
    expect(result.snapshotsWritten).toBe(0);
    const events = await testPrisma.event.findMany();
    expect(events).toHaveLength(0);
  });

  it("marks an event LIVE once its start time passes, and stops writing new snapshots for it", async () => {
    const { provider } = await seedForWorker();
    const futureCommenceTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const fakeProvider = new FixedEventsProvider([moneylineEvent("game-2", futureCommenceTime)]);

    await runWorkerCycle(testPrisma, fakeProvider, provider.id, {
      includePlayerProps: false,
      includeFutures: false,
    });

    const eventBefore = await testPrisma.event.findFirstOrThrow();
    expect(eventBefore.status).toBe("SCHEDULED");
    const snapshotsAfterFirst = await testPrisma.oddsSnapshot.count();

    // Simulate the game having actually started by moving its start time
    // into the past, then run another cycle reporting an unchanged price.
    await testPrisma.event.update({ where: { id: eventBefore.id }, data: { startTime: new Date(Date.now() - 1000) } });

    await runWorkerCycle(testPrisma, fakeProvider, provider.id, {
      includePlayerProps: false,
      includeFutures: false,
    });

    const eventAfter = await testPrisma.event.findUniqueOrThrow({ where: { id: eventBefore.id } });
    expect(eventAfter.status).toBe("LIVE");
    const snapshotsAfterSecond = await testPrisma.oddsSnapshot.count();
    expect(snapshotsAfterSecond).toBe(snapshotsAfterFirst); // no new/updated snapshot written once live
  });
});
