import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { MARKET_TYPE_CATALOG } from "../src/lib/normalization/marketTypeCatalog";
import { SPORTS } from "../src/lib/seedData/sportsAndLeagues";
import { SPORTSBOOKS } from "../src/lib/seedData/sportsbooks";
import { NBA_TEAMS } from "../src/lib/seedData/nbaTeams";
import { EPL_TEAMS } from "../src/lib/seedData/eplTeams";
import { NBA_PLAYERS } from "../src/lib/seedData/nbaPlayers";

const prisma = new PrismaClient();

/**
 * Seeds only real reference data: providers, sportsbooks, sports/leagues,
 * market types, a starter roster of NBA + EPL teams/players, the settings
 * singleton, and the single MVP user. No fabricated events, odds,
 * snapshots, EV/arbitrage numbers, or placed bets -- those come from the
 * odds provider (real or mock) via `npm run worker:once`, never from here.
 * See tests/db/fixtures.ts and src/lib/providers/mock.ts if you need
 * synthetic data for local development or tests.
 */
async function main() {
  console.log("Seeding sybaubetting...");

  // --- API providers --------------------------------------------------
  const theOddsApi = await prisma.apiProvider.upsert({
    where: { slug: "the-odds-api" },
    update: {},
    create: { name: "The Odds API", slug: "the-odds-api", baseUrl: "https://api.the-odds-api.com/v4" },
  });
  const mockProvider = await prisma.apiProvider.upsert({
    where: { slug: "mock-provider" },
    update: {},
    create: { name: "Mock Odds Provider", slug: "mock-provider", baseUrl: "local://mock" },
  });

  // --- Sportsbooks ------------------------------------------------------
  for (const sb of SPORTSBOOKS) {
    const created = await prisma.sportsbook.upsert({
      where: { slug: sb.slug },
      update: { isSharp: sb.isSharp },
      create: { name: sb.name, slug: sb.slug, websiteUrl: sb.websiteUrl, isSharp: sb.isSharp },
    });

    for (const provider of [theOddsApi, mockProvider]) {
      await prisma.providerSportsbook.upsert({
        where: {
          apiProviderId_externalSportsbookId: { apiProviderId: provider.id, externalSportsbookId: sb.theOddsApiKey },
        },
        update: {},
        create: { apiProviderId: provider.id, sportsbookId: created.id, externalSportsbookId: sb.theOddsApiKey },
      });
    }
  }

  // --- Sports / leagues ---------------------------------------------------
  const leagueIdByAbbreviation = new Map<string, number>();
  for (const sport of SPORTS) {
    const sportRow = await prisma.sport.upsert({
      where: { slug: sport.slug },
      update: {},
      create: { name: sport.name, slug: sport.slug },
    });
    for (const league of sport.leagues) {
      const leagueRow = await prisma.league.upsert({
        where: { sportId_name: { sportId: sportRow.id, name: league.name } },
        update: {},
        create: {
          sportId: sportRow.id,
          name: league.name,
          abbreviation: league.abbreviation,
          countryCode: league.countryCode,
        },
      });
      leagueIdByAbbreviation.set(league.abbreviation, leagueRow.id);

      for (const provider of [theOddsApi, mockProvider]) {
        await prisma.providerLeague.upsert({
          where: {
            apiProviderId_externalLeagueKey: { apiProviderId: provider.id, externalLeagueKey: league.theOddsApiKey },
          },
          update: { externalFuturesKey: league.theOddsApiFuturesKey },
          create: {
            apiProviderId: provider.id,
            leagueId: leagueRow.id,
            externalLeagueKey: league.theOddsApiKey,
            externalFuturesKey: league.theOddsApiFuturesKey,
          },
        });
      }
    }
  }
  const nbaLeagueId = leagueIdByAbbreviation.get("NBA")!;
  const eplLeagueId = leagueIdByAbbreviation.get("EPL")!;

  // --- Market types -------------------------------------------------------
  for (const def of MARKET_TYPE_CATALOG) {
    const row = await prisma.marketType.upsert({
      where: { code: def.code },
      update: {},
      create: {
        code: def.code,
        name: def.name,
        category: def.category,
        hasLine: def.hasLine,
        expectedOutcomeCount: def.expectedOutcomeCount,
      },
    });

    for (const provider of [theOddsApi, mockProvider]) {
      for (const key of def.providerKeys) {
        await prisma.providerMarketType.upsert({
          where: { apiProviderId_externalMarketKey: { apiProviderId: provider.id, externalMarketKey: key } },
          update: {},
          create: { apiProviderId: provider.id, marketTypeId: row.id, externalMarketKey: key },
        });
      }
    }
  }

  // --- Teams (starter roster -- any team not listed here is auto-created
  // on first sighting by MarketMatcher.resolveTeam, see SCHEMA_CHANGES.md) --
  const nbaTeamIdByAbbreviation = new Map<string, number>();
  for (const team of NBA_TEAMS) {
    const row = await prisma.team.upsert({
      where: { leagueId_name: { leagueId: nbaLeagueId, name: team.name } },
      update: {},
      create: { leagueId: nbaLeagueId, name: team.name, city: team.city, abbreviation: team.abbreviation },
    });
    nbaTeamIdByAbbreviation.set(team.abbreviation, row.id);
  }

  for (const team of EPL_TEAMS) {
    await prisma.team.upsert({
      where: { leagueId_name: { leagueId: eplLeagueId, name: team.name } },
      update: {},
      create: { leagueId: eplLeagueId, name: team.name, city: team.city || null, abbreviation: team.abbreviation },
    });
  }

  // --- Players (starter roster -- same auto-create fallback as teams) -----
  for (const player of NBA_PLAYERS) {
    const teamId = nbaTeamIdByAbbreviation.get(player.teamAbbreviation)!;
    const normalizedName = player.name.toLowerCase();
    const existing = await prisma.player.findFirst({ where: { normalizedName } });
    if (!existing) {
      await prisma.player.create({
        data: { name: player.name, normalizedName, currentTeamId: teamId },
      });
    }
  }

  // --- Settings singleton --------------------------------------------
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      refreshFrequencySeconds: 120,
      minEvPercentThreshold: 2,
      maxQuoteAgeSeconds: 600,
      bankroll: 1000,
      defaultStakeSize: 25,
      consensusMethod: "median",
    },
  });

  // --- Single MVP user -----------------------------------------------
  await prisma.user.upsert({
    where: { email: process.env.DEFAULT_USER_EMAIL ?? "conradflick11@gmail.com" },
    update: {},
    create: { email: process.env.DEFAULT_USER_EMAIL ?? "conradflick11@gmail.com" },
  });

  console.log("Seed complete. Run `npm run worker:once` to pull real odds data.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
