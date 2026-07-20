import type { PrismaClient } from "@prisma/client";

/** Minimal seeded state (one provider, one sport/league, a few teams) shared by DB tests. */
export async function seedMinimalFixture(prisma: PrismaClient) {
  const provider = await prisma.apiProvider.create({
    data: { name: "Test Provider", slug: "test-provider", baseUrl: "https://example.test" },
  });

  const sport = await prisma.sport.create({ data: { name: "Basketball", slug: "basketball" } });
  const league = await prisma.league.create({
    data: { sportId: sport.id, name: "NBA", abbreviation: "NBA", countryCode: "US" },
  });

  const celtics = await prisma.team.create({
    data: { leagueId: league.id, name: "Celtics", city: "Boston", abbreviation: "BOS" },
  });
  const lakers = await prisma.team.create({
    data: { leagueId: league.id, name: "Lakers", city: "Los Angeles", abbreviation: "LAL" },
  });

  const moneyline = await prisma.marketType.create({
    data: { code: "MONEYLINE", name: "Moneyline", category: "game", hasLine: false, expectedOutcomeCount: 2 },
  });
  const spread = await prisma.marketType.create({
    data: { code: "SPREAD", name: "Point Spread", category: "game", hasLine: true, expectedOutcomeCount: 2 },
  });
  const total = await prisma.marketType.create({
    data: { code: "TOTAL", name: "Game Total", category: "game", hasLine: true, expectedOutcomeCount: 2 },
  });
  const playerPoints = await prisma.marketType.create({
    data: { code: "PLAYER_POINTS", name: "Player Points", category: "player_prop", hasLine: true, expectedOutcomeCount: 2 },
  });
  const futuresWinner = await prisma.marketType.create({
    data: { code: "FUTURES_WINNER", name: "Championship Winner", category: "future", hasLine: false, expectedOutcomeCount: 0 },
  });

  return { provider, sport, league, celtics, lakers, moneyline, spread, total, playerPoints, futuresWinner };
}
