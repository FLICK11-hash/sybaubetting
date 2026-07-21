import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetTestDb } from "./testDb";
import { seedMinimalFixture } from "./fixtures";
import { MarketMatcher } from "@/lib/normalization/marketMatcher";
import { recalculateOutcomeOpportunities } from "@/lib/worker/opportunityCalculator";

describe("recalculateOutcomeOpportunities - fair probability method by market shape", () => {
  beforeEach(resetTestDb);

  it("de-vigs a spread market against its mirror line (NO_VIG, not a plain-consensus fallback)", async () => {
    const { provider, league, spread } = await seedMinimalFixture(testPrisma);
    const matcher = new MarketMatcher(testPrisma, provider.id);
    const { eventId, homeTeamId, awayTeamId } = await matcher.resolveEvent(league.id, {
      id: "ext-1",
      commenceTime: "2026-08-01T00:00:00Z",
      homeTeam: "Celtics",
      awayTeam: "Lakers",
    });

    // Two books quoting both sides of the same -3.5/+3.5 spread.
    const quote = (celticsPrice: number, lakersPrice: number) => ({
      key: "spreads",
      lastUpdate: new Date().toISOString(),
      outcomes: [
        { name: "Celtics", price: celticsPrice, point: -3.5 },
        { name: "Lakers", price: lakersPrice, point: 3.5 },
      ],
    });

    const targetsA = await matcher.resolveGameMarketOutcomes({
      eventId,
      leagueId: league.id,
      homeTeamId,
      awayTeamId,
      homeTeamName: "Celtics",
      awayTeamName: "Lakers",
      marketTypeId: spread.id,
      marketTypeName: "Spread",
      period: "full_game",
      sportsbookId: 0,
      quote: quote(-110, -110),
    });
    await matcher.resolveGameMarketOutcomes({
      eventId,
      leagueId: league.id,
      homeTeamId,
      awayTeamId,
      homeTeamName: "Celtics",
      awayTeamName: "Lakers",
      marketTypeId: spread.id,
      marketTypeName: "Spread",
      period: "full_game",
      sportsbookId: 0,
      quote: quote(-105, -115),
    });

    const celticsOutcomeId = targetsA[0].outcomeId;
    const lakersOutcomeId = targetsA[1].outcomeId;

    // Sanity check on the premise: the two sides really do live on separate
    // MarketLines (this is deliberate schema design, see marketMatcher.ts),
    // which is exactly why the naive "same-line siblings" check used to miss
    // spreads entirely.
    const celticsOutcome = await testPrisma.outcome.findUniqueOrThrow({ where: { id: celticsOutcomeId } });
    const lakersOutcome = await testPrisma.outcome.findUniqueOrThrow({ where: { id: lakersOutcomeId } });
    expect(celticsOutcome.marketLineId).not.toBe(lakersOutcome.marketLineId);

    const bookX = await testPrisma.sportsbook.create({ data: { name: "Book X", slug: "book-x" } });
    const bookY = await testPrisma.sportsbook.create({ data: { name: "Book Y", slug: "book-y" } });
    await testPrisma.oddsSnapshot.create({
      data: {
        outcomeId: celticsOutcomeId,
        sportsbookId: bookX.id,
        apiProviderId: provider.id,
        americanOdds: -110,
        decimalOdds: 1.9091,
        impliedProbability: 0.5238,
        capturedAt: new Date(),
        receivedAt: new Date(),
        isCurrent: true,
      },
    });
    await testPrisma.oddsSnapshot.create({
      data: {
        outcomeId: celticsOutcomeId,
        sportsbookId: bookY.id,
        apiProviderId: provider.id,
        americanOdds: -105,
        decimalOdds: 1.9524,
        impliedProbability: 0.5122,
        capturedAt: new Date(),
        receivedAt: new Date(),
        isCurrent: true,
      },
    });
    // The mirror line (Lakers +3.5) needs at least one live price too, or
    // there's nothing to de-vig against and this would (still, wrongly)
    // fall back to plain consensus.
    await testPrisma.oddsSnapshot.create({
      data: {
        outcomeId: lakersOutcomeId,
        sportsbookId: bookX.id,
        apiProviderId: provider.id,
        americanOdds: -110,
        decimalOdds: 1.9091,
        impliedProbability: 0.5238,
        capturedAt: new Date(),
        receivedAt: new Date(),
        isCurrent: true,
      },
    });

    await recalculateOutcomeOpportunities(testPrisma, celticsOutcomeId, {});

    const snapshot = await testPrisma.oddsSnapshot.findFirstOrThrow({
      where: { outcomeId: celticsOutcomeId, sportsbookId: bookX.id },
    });
    const opportunity = await testPrisma.bettingOpportunity.findUniqueOrThrow({
      where: { oddsSnapshotId: snapshot.id },
      include: { fairProbabilityEstimate: true },
    });

    expect(opportunity.fairProbabilityEstimate).not.toBeNull();
    expect(opportunity.fairProbabilityEstimate!.estimationMethod).toBe("NO_VIG");
    // De-vigged probability must be strictly below the raw consensus of the
    // same side's own (vig-included) prices -- that's what proves the vig
    // actually got removed instead of just averaging two vigged numbers.
    expect(Number(opportunity.fairProbabilityEstimate!.probability)).toBeLessThan(0.518);
  });
});
