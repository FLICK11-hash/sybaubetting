import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetTestDb } from "./testDb";
import { seedMinimalFixture } from "./fixtures";
import { MarketMatcher } from "@/lib/normalization/marketMatcher";
import { writeOddsSnapshot } from "@/lib/worker/snapshotWriter";

describe("writeOddsSnapshot", () => {
  beforeEach(resetTestDb);

  async function makeOutcome() {
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
    const sportsbook = await testPrisma.sportsbook.create({ data: { name: "Book A", slug: "book-a" } });
    return { outcomeId: targets[0].outcomeId, apiProviderId: provider.id, sportsbookId: sportsbook.id };
  }

  it("bumps receivedAt on an unchanged price, without inserting a new row", async () => {
    const { outcomeId, apiProviderId, sportsbookId } = await makeOutcome();

    const first = await writeOddsSnapshot(testPrisma, {
      outcomeId,
      sportsbookId,
      apiProviderId,
      americanOdds: -150,
      capturedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // the book last actually changed this price 2h ago
    });
    expect(first.changed).toBe(true);
    const afterFirst = await testPrisma.oddsSnapshot.findUniqueOrThrow({ where: { id: first.snapshotId } });
    const receivedAtAfterFirst = afterFirst.receivedAt.getTime();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Same price reconfirmed a moment later -- still unchanged, still within
    // the resample window, so no new row should be created...
    const second = await writeOddsSnapshot(testPrisma, {
      outcomeId,
      sportsbookId,
      apiProviderId,
      americanOdds: -150,
      capturedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // book's own timestamp still hasn't moved
    });
    expect(second.changed).toBe(false);
    expect(second.snapshotId).toBe(first.snapshotId);

    const total = await testPrisma.oddsSnapshot.count({ where: { outcomeId, sportsbookId } });
    expect(total).toBe(1); // still just one row -- confirmation isn't a new historical data point

    // ...but receivedAt must have moved forward, proving we now have a
    // reliable "we just re-checked and this book is still live" signal even
    // though the book's own capturedAt is old and never changes.
    const afterSecond = await testPrisma.oddsSnapshot.findUniqueOrThrow({ where: { id: second.snapshotId } });
    expect(afterSecond.receivedAt.getTime()).toBeGreaterThan(receivedAtAfterFirst);
    expect(afterSecond.capturedAt.getTime()).toBe(afterFirst.capturedAt.getTime()); // capturedAt itself is untouched
  });
});
