import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetTestDb } from "./testDb";
import { seedMinimalFixture } from "./fixtures";
import { MarketMatcher } from "@/lib/normalization/marketMatcher";

describe("MarketMatcher - team resolution", () => {
  beforeEach(resetTestDb);

  it("resolves an exact team name match and caches it as a provider mapping", async () => {
    const { provider, league, celtics } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const teamId = await matcher.resolveTeam(league.id, "Celtics");
    expect(teamId).toBe(celtics.id);

    const mapping = await testPrisma.providerTeam.findFirst({
      where: { apiProviderId: provider.id, teamId: celtics.id },
    });
    expect(mapping?.externalTeamName).toBe("Celtics");
  });

  it("resolves a team via normalized name when the provider spells it differently", async () => {
    const { provider, league, lakers } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const teamId = await matcher.resolveTeam(league.id, "LA Lakers");
    expect(teamId).toBe(lakers.id);
  });

  it("resolves a team via full 'city + name' concatenation", async () => {
    const { provider, league, celtics } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const teamId = await matcher.resolveTeam(league.id, "Boston Celtics");
    expect(teamId).toBe(celtics.id);
  });

  it("reuses the cached provider mapping on subsequent lookups instead of re-scanning", async () => {
    const { provider, league, celtics } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    await matcher.resolveTeam(league.id, "Boston Celtics");
    await matcher.resolveTeam(league.id, "Boston Celtics");

    const mappings = await testPrisma.providerTeam.findMany({
      where: { apiProviderId: provider.id, teamId: celtics.id },
    });
    expect(mappings).toHaveLength(1);
  });

  it("auto-creates a team on first sighting when there is no seeded match", async () => {
    const { provider, league } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const teamId = await matcher.resolveTeam(league.id, "Miami Heat");

    const team = await testPrisma.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(team.name).toBe("Miami Heat");
    expect(team.leagueId).toBe(league.id);

    const mapping = await testPrisma.providerTeam.findFirst({
      where: { apiProviderId: provider.id, teamId },
    });
    expect(mapping?.externalTeamName).toBe("Miami Heat");
  });

  it("does not create a duplicate team when the same unseen name is resolved twice", async () => {
    const { provider, league } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const first = await matcher.resolveTeam(league.id, "Miami Heat");
    const second = await matcher.resolveTeam(league.id, "Miami Heat");

    expect(second).toBe(first);
    const teams = await testPrisma.team.findMany({ where: { leagueId: league.id, name: "Miami Heat" } });
    expect(teams).toHaveLength(1);
  });

  it("tryResolveTeam succeeds (auto-create) for a name with no seeded match", async () => {
    const { provider, league } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const result = await matcher.tryResolveTeam(league.id, "Miami Heat");
    expect(result).not.toBeNull();
  });
});

describe("MarketMatcher - player resolution", () => {
  beforeEach(resetTestDb);

  it("creates a new player on first sighting and maps the provider spelling", async () => {
    const { provider } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const playerId = await matcher.resolvePlayer("LeBron James");
    const player = await testPrisma.player.findUniqueOrThrow({ where: { id: playerId } });
    expect(player.normalizedName).toBe("lebron james");
  });

  it("does not create a duplicate player for an accented respelling of an existing player", async () => {
    const { provider } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const firstId = await matcher.resolvePlayer("Nikola Jokic");
    const secondId = await matcher.resolvePlayer("Nikola Jokić");

    expect(secondId).toBe(firstId);
    const allPlayers = await testPrisma.player.findMany({ where: { normalizedName: "nikola jokic" } });
    expect(allPlayers).toHaveLength(1);
  });

  it("caches the provider mapping after first resolution", async () => {
    const { provider } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    await matcher.resolvePlayer("LeBron James");
    await matcher.resolvePlayer("LeBron James");

    const mappings = await testPrisma.providerPlayer.findMany({
      where: { apiProviderId: provider.id, externalPlayerName: "LeBron James" },
    });
    expect(mappings).toHaveLength(1);
  });
});

describe("MarketMatcher - event resolution", () => {
  beforeEach(resetTestDb);

  it("creates a new event and a provider_events mapping row", async () => {
    const { provider, league } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const result = await matcher.resolveEvent(league.id, {
      id: "ext-1",
      commenceTime: "2026-08-01T00:00:00Z",
      homeTeam: "Celtics",
      awayTeam: "Lakers",
    });

    const event = await testPrisma.event.findUniqueOrThrow({ where: { id: result.eventId } });
    expect(event.homeTeamId).toBe(result.homeTeamId);

    const mapping = await testPrisma.providerEvent.findUniqueOrThrow({
      where: { apiProviderId_externalEventId: { apiProviderId: provider.id, externalEventId: "ext-1" } },
    });
    expect(mapping.eventId).toBe(result.eventId);
  });

  it("does not create a duplicate event when the same external id is resolved twice", async () => {
    const { provider, league } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const first = await matcher.resolveEvent(league.id, {
      id: "ext-1",
      commenceTime: "2026-08-01T00:00:00Z",
      homeTeam: "Celtics",
      awayTeam: "Lakers",
    });
    const second = await matcher.resolveEvent(league.id, {
      id: "ext-1",
      commenceTime: "2026-08-01T00:00:00Z",
      homeTeam: "Celtics",
      awayTeam: "Lakers",
    });

    expect(second.eventId).toBe(first.eventId);
    const allEvents = await testPrisma.event.findMany({ where: { leagueId: league.id } });
    expect(allEvents).toHaveLength(1);
  });

  it("matches the same game reported by a second provider under a slightly different start time", async () => {
    const { league } = await seedMinimalFixture(testPrisma);
    const providerA = await testPrisma.apiProvider.create({
      data: { name: "Provider A", slug: "provider-a", baseUrl: "https://a.test" },
    });
    const providerB = await testPrisma.apiProvider.create({
      data: { name: "Provider B", slug: "provider-b", baseUrl: "https://b.test" },
    });
    const matcherA = new MarketMatcher(testPrisma, providerA.id);
    const matcherB = new MarketMatcher(testPrisma, providerB.id);

    const first = await matcherA.resolveEvent(league.id, {
      id: "a-ext-1",
      commenceTime: "2026-08-01T00:00:00Z",
      homeTeam: "Celtics",
      awayTeam: "Lakers",
    });
    // Provider B reports the same game 20 minutes later than provider A -- still the same event.
    const second = await matcherB.resolveEvent(league.id, {
      id: "b-ext-1",
      commenceTime: "2026-08-01T00:20:00Z",
      homeTeam: "Boston Celtics",
      awayTeam: "LA Lakers",
    });

    expect(second.eventId).toBe(first.eventId);
  });
});

describe("MarketMatcher - market/line/outcome duplicate prevention", () => {
  beforeEach(resetTestDb);

  it("does not create duplicate markets/lines/outcomes when the same quote is ingested twice", async () => {
    const { provider, league, moneyline } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);
    const { eventId, homeTeamId, awayTeamId } = await matcher.resolveEvent(league.id, {
      id: "ext-1",
      commenceTime: "2026-08-01T00:00:00Z",
      homeTeam: "Celtics",
      awayTeam: "Lakers",
    });

    const quote = {
      key: "h2h",
      lastUpdate: new Date().toISOString(),
      outcomes: [
        { name: "Celtics", price: -150 },
        { name: "Lakers", price: 130 },
      ],
    };

    const first = await matcher.resolveGameMarketOutcomes({
      eventId,
      leagueId: league.id,
      homeTeamId,
      awayTeamId,
      homeTeamName: "Celtics",
      awayTeamName: "Lakers",
      marketTypeId: moneyline.id,
      marketTypeName: "Moneyline",
      period: "full_game",
      sportsbookId: 1,
      quote,
    });
    const second = await matcher.resolveGameMarketOutcomes({
      eventId,
      leagueId: league.id,
      homeTeamId,
      awayTeamId,
      homeTeamName: "Celtics",
      awayTeamName: "Lakers",
      marketTypeId: moneyline.id,
      marketTypeName: "Moneyline",
      period: "full_game",
      sportsbookId: 2,
      quote,
    });

    expect(second.map((r) => r.outcomeId).sort()).toEqual(first.map((r) => r.outcomeId).sort());

    const markets = await testPrisma.market.findMany({ where: { eventId } });
    expect(markets).toHaveLength(1);
    const lines = await testPrisma.marketLine.findMany({ where: { marketId: markets[0].id } });
    expect(lines).toHaveLength(1); // moneyline: one shared line for both teams
    const outcomes = await testPrisma.outcome.findMany({ where: { marketLineId: lines[0].id } });
    expect(outcomes).toHaveLength(2);
  });

  it("keeps mismatched player-prop lines as separate MarketLines, never merged", async () => {
    const { provider, league } = await seedMinimalFixture(testPrisma);
    const playerPoints = (await testPrisma.marketType.findUniqueOrThrow({ where: { code: "PLAYER_POINTS" } })).id;
    const matcher = new MarketMatcher(testPrisma, provider.id);
    const { eventId } = await matcher.resolveEvent(league.id, {
      id: "ext-1",
      commenceTime: "2026-08-01T00:00:00Z",
      homeTeam: "Celtics",
      awayTeam: "Lakers",
    });
    const playerId = await matcher.resolvePlayer("LeBron James");

    await matcher.resolvePlayerPropOutcomes({
      eventId,
      leagueId: league.id,
      playerId,
      playerName: "LeBron James",
      marketTypeId: playerPoints,
      marketTypeName: "Points",
      period: "full_game",
      sportsbookId: 1,
      quote: {
        key: "player_points",
        lastUpdate: new Date().toISOString(),
        outcomes: [
          { name: "Over", price: -115, point: 25.5 },
          { name: "Under", price: -105, point: 25.5 },
        ],
      },
    });
    await matcher.resolvePlayerPropOutcomes({
      eventId,
      leagueId: league.id,
      playerId,
      playerName: "LeBron James",
      marketTypeId: playerPoints,
      marketTypeName: "Points",
      period: "full_game",
      sportsbookId: 2,
      quote: {
        key: "player_points",
        lastUpdate: new Date().toISOString(),
        outcomes: [
          { name: "Over", price: -110, point: 26.5 },
          { name: "Under", price: -110, point: 26.5 },
        ],
      },
    });

    const markets = await testPrisma.market.findMany({ where: { eventId, playerId } });
    expect(markets).toHaveLength(1); // same market (LeBron James Points)

    const lines = await testPrisma.marketLine.findMany({ where: { marketId: markets[0].id } });
    expect(lines).toHaveLength(2); // 25.5 and 26.5 are distinct lines
    const lineValues = lines.map((l) => Number(l.lineValue)).sort((a, b) => a - b);
    expect(lineValues).toEqual([25.5, 26.5]);
  });

  it("gives spread outcomes for opposite teams separate MarketLines even under the same market", async () => {
    const { provider, league, spread } = await seedMinimalFixture(testPrisma);
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
      marketTypeId: spread.id,
      marketTypeName: "Spread",
      period: "full_game",
      sportsbookId: 1,
      quote: {
        key: "spreads",
        lastUpdate: new Date().toISOString(),
        outcomes: [
          { name: "Celtics", price: -110, point: -3.5 },
          { name: "Lakers", price: -110, point: 3.5 },
        ],
      },
    });

    expect(new Set(targets.map((t) => t.marketLineId)).size).toBe(2);
  });

  it("shares one MarketLine between Over and Under for a game total", async () => {
    const { provider, league, total } = await seedMinimalFixture(testPrisma);
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
      marketTypeId: total.id,
      marketTypeName: "Total",
      period: "full_game",
      sportsbookId: 1,
      quote: {
        key: "totals",
        lastUpdate: new Date().toISOString(),
        outcomes: [
          { name: "Over", price: -110, point: 221.5 },
          { name: "Under", price: -110, point: 221.5 },
        ],
      },
    });

    expect(new Set(targets.map((t) => t.marketLineId)).size).toBe(1);
  });

  it("does not confuse full-game and first-half markets of the same type", async () => {
    const { provider, league, moneyline } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);
    const { eventId, homeTeamId, awayTeamId } = await matcher.resolveEvent(league.id, {
      id: "ext-1",
      commenceTime: "2026-08-01T00:00:00Z",
      homeTeam: "Celtics",
      awayTeam: "Lakers",
    });

    const quote = {
      key: "h2h",
      lastUpdate: new Date().toISOString(),
      outcomes: [
        { name: "Celtics", price: -150 },
        { name: "Lakers", price: 130 },
      ],
    };

    await matcher.resolveGameMarketOutcomes({
      eventId,
      leagueId: league.id,
      homeTeamId,
      awayTeamId,
      homeTeamName: "Celtics",
      awayTeamName: "Lakers",
      marketTypeId: moneyline.id,
      marketTypeName: "Moneyline",
      period: "full_game",
      sportsbookId: 1,
      quote,
    });
    await matcher.resolveGameMarketOutcomes({
      eventId,
      leagueId: league.id,
      homeTeamId,
      awayTeamId,
      homeTeamName: "Celtics",
      awayTeamName: "Lakers",
      marketTypeId: moneyline.id,
      marketTypeName: "Moneyline (1st Half)",
      period: "first_half",
      sportsbookId: 1,
      quote,
    });

    const markets = await testPrisma.market.findMany({ where: { eventId, marketTypeId: moneyline.id } });
    expect(markets).toHaveLength(2);
    expect(markets.map((m) => m.period).sort()).toEqual(["first_half", "full_game"]);
  });
});

describe("MarketMatcher - futures markets (no single game event)", () => {
  beforeEach(resetTestDb);

  it("creates a futures market with a null eventId, anchored on the league", async () => {
    const { provider, league, celtics, futuresWinner } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const targets = await matcher.resolveFuturesOutcomes({
      leagueId: league.id,
      marketTypeId: futuresWinner.id,
      title: "NBA Championship Winner",
      sportsbookId: 1,
      quote: {
        key: "outrights",
        lastUpdate: new Date().toISOString(),
        outcomes: [
          { name: "Celtics", price: 450 },
          { name: "Lakers", price: 700 },
        ],
      },
    });

    expect(targets).toHaveLength(2);
    const market = await testPrisma.market.findUniqueOrThrow({ where: { id: targets[0].marketId } });
    expect(market.eventId).toBeNull();
    expect(market.leagueId).toBe(league.id);

    // Entrants that match a seeded team get resolved to that team.
    const celticsOutcome = await testPrisma.outcome.findFirstOrThrow({ where: { id: targets[0].outcomeId } });
    expect(celticsOutcome.teamId).toBe(celtics.id);
  });

  it("does not create a duplicate futures market when ingested twice", async () => {
    const { provider, league, futuresWinner } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);
    const quote = {
      key: "outrights",
      lastUpdate: new Date().toISOString(),
      outcomes: [{ name: "Celtics", price: 450 }],
    };

    await matcher.resolveFuturesOutcomes({ leagueId: league.id, marketTypeId: futuresWinner.id, title: "NBA Championship Winner", sportsbookId: 1, quote });
    await matcher.resolveFuturesOutcomes({ leagueId: league.id, marketTypeId: futuresWinner.id, title: "NBA Championship Winner", sportsbookId: 2, quote });

    const markets = await testPrisma.market.findMany({ where: { leagueId: league.id, marketTypeId: futuresWinner.id } });
    expect(markets).toHaveLength(1);
  });

  it("auto-creates a futures entrant that doesn't match any seeded team, without failing the whole ingest", async () => {
    const { provider, league, futuresWinner } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);

    const targets = await matcher.resolveFuturesOutcomes({
      leagueId: league.id,
      marketTypeId: futuresWinner.id,
      title: "NBA Championship Winner",
      sportsbookId: 1,
      quote: {
        key: "outrights",
        lastUpdate: new Date().toISOString(),
        outcomes: [{ name: "Miami Heat", price: 2000 }], // not seeded in this fixture
      },
    });

    const outcome = await testPrisma.outcome.findUniqueOrThrow({ where: { id: targets[0].outcomeId } });
    expect(outcome.teamId).not.toBeNull();
    expect(outcome.label).toBe("Miami Heat");
  });
});
