import { PrismaClient } from "@prisma/client";
import { MarketMatcher } from "../src/lib/normalization/marketMatcher";
import { MARKET_TYPE_CATALOG } from "../src/lib/normalization/marketTypeCatalog";
import { SPORTS } from "../src/lib/seedData/sportsAndLeagues";
import { SPORTSBOOKS } from "../src/lib/seedData/sportsbooks";
import { NBA_TEAMS } from "../src/lib/seedData/nbaTeams";
import { EPL_TEAMS } from "../src/lib/seedData/eplTeams";
import { NBA_PLAYERS } from "../src/lib/seedData/nbaPlayers";
import { americanToDecimal, decimalToImpliedProbability, roundDecimalOdds, roundProbability } from "../src/lib/odds/conversion";
import { noVigProbabilityTwoWay } from "../src/lib/odds/noVig";
import { expectedValue } from "../src/lib/odds/expectedValue";
import { detectOutliers } from "../src/lib/odds/outliers";
import { detectArbitrage } from "../src/lib/odds/arbitrage";

const prisma = new PrismaClient();

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
  const sportsbookIdBySlug = new Map<string, number>();
  for (const sb of SPORTSBOOKS) {
    const created = await prisma.sportsbook.upsert({
      where: { slug: sb.slug },
      update: { isSharp: sb.isSharp },
      create: { name: sb.name, slug: sb.slug, websiteUrl: sb.websiteUrl, isSharp: sb.isSharp },
    });
    sportsbookIdBySlug.set(sb.slug, created.id);

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
          update: {},
          create: { apiProviderId: provider.id, leagueId: leagueRow.id, externalLeagueKey: league.theOddsApiKey },
        });
      }
    }
  }
  const nbaLeagueId = leagueIdByAbbreviation.get("NBA")!;
  const eplLeagueId = leagueIdByAbbreviation.get("EPL")!;

  // --- Market types -------------------------------------------------------
  const marketTypeIdByCode = new Map<string, number>();
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
    marketTypeIdByCode.set(def.code, row.id);

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

  // --- Teams ----------------------------------------------------------
  const nbaTeamIdByAbbreviation = new Map<string, number>();
  for (const team of NBA_TEAMS) {
    const row = await prisma.team.upsert({
      where: { leagueId_name: { leagueId: nbaLeagueId, name: team.name } },
      update: {},
      create: { leagueId: nbaLeagueId, name: team.name, city: team.city, abbreviation: team.abbreviation },
    });
    nbaTeamIdByAbbreviation.set(team.abbreviation, row.id);
  }

  const eplTeamIdByAbbreviation = new Map<string, number>();
  for (const team of EPL_TEAMS) {
    const row = await prisma.team.upsert({
      where: { leagueId_name: { leagueId: eplLeagueId, name: team.name } },
      update: {},
      create: { leagueId: eplLeagueId, name: team.name, city: team.city || null, abbreviation: team.abbreviation },
    });
    eplTeamIdByAbbreviation.set(team.abbreviation, row.id);
  }

  // --- Players -----------------------------------------------------------
  const playerIdByName = new Map<string, number>();
  for (const player of NBA_PLAYERS) {
    const teamId = nbaTeamIdByAbbreviation.get(player.teamAbbreviation)!;
    const normalizedName = player.name.toLowerCase();
    const existing = await prisma.player.findFirst({ where: { normalizedName } });
    const row =
      existing ??
      (await prisma.player.create({
        data: { name: player.name, normalizedName, currentTeamId: teamId },
      }));
    playerIdByName.set(player.name, row.id);
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

  // --- Sample user (private single-user MVP) ------------------------------
  await prisma.user.upsert({
    where: { email: "conradflick11@gmail.com" },
    update: {},
    create: { email: "conradflick11@gmail.com" },
  });

  // --- Sample events + odds, ingested via MarketMatcher for realism -----
  const matcher = new MarketMatcher(prisma, theOddsApi.id);
  const now = new Date();
  const in3Hours = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const in27Hours = new Date(now.getTime() + 27 * 60 * 60 * 1000);
  const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  const lakersCeltics = await matcher.resolveEvent(nbaLeagueId, {
    id: "seed-event-lal-bos",
    commenceTime: in3Hours.toISOString(),
    homeTeam: "Boston Celtics",
    awayTeam: "Los Angeles Lakers",
  });
  const nuggetsBucks = await matcher.resolveEvent(nbaLeagueId, {
    id: "seed-event-den-mil",
    commenceTime: in27Hours.toISOString(),
    homeTeam: "Milwaukee Bucks",
    awayTeam: "Denver Nuggets",
  });
  const arsenalChelsea = await matcher.resolveEvent(eplLeagueId, {
    id: "seed-event-ars-che",
    commenceTime: in5Days.toISOString(),
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
  });

  const sbId = (slug: string) => sportsbookIdBySlug.get(slug)!;

  async function snapshot(outcomeId: number, sportsbookSlug: string, americanOdds: number, capturedAt: Date) {
    const decimalOdds = roundDecimalOdds(americanToDecimal(americanOdds));
    const impliedProbability = roundProbability(decimalToImpliedProbability(decimalOdds));
    return prisma.oddsSnapshot.create({
      data: {
        outcomeId,
        sportsbookId: sbId(sportsbookSlug),
        apiProviderId: theOddsApi.id,
        americanOdds,
        decimalOdds,
        impliedProbability,
        capturedAt,
        isCurrent: true,
      },
    });
  }

  // ---- 1) Moneyline: Celtics/Lakers (illustrates best price + outlier) ----
  const moneylineTargets = await matcher.resolveGameMarketOutcomes({
    eventId: lakersCeltics.eventId,
    leagueId: nbaLeagueId,
    homeTeamId: lakersCeltics.homeTeamId,
    awayTeamId: lakersCeltics.awayTeamId,
    homeTeamName: "Boston Celtics",
    awayTeamName: "Los Angeles Lakers",
    marketTypeId: marketTypeIdByCode.get("MONEYLINE")!,
    marketTypeName: "Moneyline",
    period: "full_game",
    sportsbookId: 0,
    quote: {
      key: "h2h",
      lastUpdate: now.toISOString(),
      outcomes: [
        { name: "Boston Celtics", price: -150 },
        { name: "Los Angeles Lakers", price: 130 },
      ],
    },
  });
  const [celticsMl, lakersMl] = moneylineTargets;
  await snapshot(celticsMl.outcomeId, "draftkings", -150, now);
  await snapshot(celticsMl.outcomeId, "fanduel", -145, now);
  await snapshot(celticsMl.outcomeId, "betmgm", -160, now);
  await snapshot(lakersMl.outcomeId, "draftkings", 130, now);
  await snapshot(lakersMl.outcomeId, "fanduel", 125, now);
  // Pinnacle (sharp reference) pays out noticeably more on the Lakers -> flagged as a favorable outlier
  await snapshot(lakersMl.outcomeId, "pinnacle", 165, now);

  // ---- 2) Spread + Total for the same game --------------------------
  const spreadTargets = await matcher.resolveGameMarketOutcomes({
    eventId: lakersCeltics.eventId,
    leagueId: nbaLeagueId,
    homeTeamId: lakersCeltics.homeTeamId,
    awayTeamId: lakersCeltics.awayTeamId,
    homeTeamName: "Boston Celtics",
    awayTeamName: "Los Angeles Lakers",
    marketTypeId: marketTypeIdByCode.get("SPREAD")!,
    marketTypeName: "Spread",
    period: "full_game",
    sportsbookId: 0,
    quote: {
      key: "spreads",
      lastUpdate: now.toISOString(),
      outcomes: [
        { name: "Boston Celtics", price: -110, point: -3.5 },
        { name: "Los Angeles Lakers", price: -110, point: 3.5 },
      ],
    },
  });
  for (const t of spreadTargets) {
    const isHome = t === spreadTargets[0];
    await snapshot(t.outcomeId, "draftkings", isHome ? -110 : -110, now);
    await snapshot(t.outcomeId, "fanduel", isHome ? -108 : -112, now);
    await snapshot(t.outcomeId, "betmgm", isHome ? -105 : -115, now);
  }

  const totalTargets = await matcher.resolveGameMarketOutcomes({
    eventId: lakersCeltics.eventId,
    leagueId: nbaLeagueId,
    homeTeamId: lakersCeltics.homeTeamId,
    awayTeamId: lakersCeltics.awayTeamId,
    homeTeamName: "Boston Celtics",
    awayTeamName: "Los Angeles Lakers",
    marketTypeId: marketTypeIdByCode.get("TOTAL")!,
    marketTypeName: "Total",
    period: "full_game",
    sportsbookId: 0,
    quote: {
      key: "totals",
      lastUpdate: now.toISOString(),
      outcomes: [
        { name: "Over", price: -110, point: 221.5 },
        { name: "Under", price: -110, point: 221.5 },
      ],
    },
  });
  const [overTotal, underTotal] = totalTargets;
  await snapshot(overTotal.outcomeId, "draftkings", -110, now);
  await snapshot(overTotal.outcomeId, "fanduel", 100, now); // best price example from the spec
  await snapshot(overTotal.outcomeId, "betmgm", -105, now);
  await snapshot(underTotal.outcomeId, "draftkings", -110, now);
  await snapshot(underTotal.outcomeId, "fanduel", -120, now);
  await snapshot(underTotal.outcomeId, "betmgm", -115, now);

  // ---- 3) Player prop: LeBron James points, deliberately mismatched lines
  // across books (25.5 vs 26.5) -- these must NOT be compared as if equal.
  const lebronId = playerIdByName.get("LeBron James")!;
  const lebron255 = await matcher.resolvePlayerPropOutcomes({
    eventId: lakersCeltics.eventId,
    leagueId: nbaLeagueId,
    playerId: lebronId,
    playerName: "LeBron James",
    marketTypeId: marketTypeIdByCode.get("PLAYER_POINTS")!,
    marketTypeName: "Points",
    period: "full_game",
    sportsbookId: 0,
    quote: {
      key: "player_points",
      lastUpdate: now.toISOString(),
      outcomes: [
        { name: "Over", price: -115, point: 25.5 },
        { name: "Under", price: -105, point: 25.5 },
      ],
    },
  });
  const lebron265 = await matcher.resolvePlayerPropOutcomes({
    eventId: lakersCeltics.eventId,
    leagueId: nbaLeagueId,
    playerId: lebronId,
    playerName: "LeBron James",
    marketTypeId: marketTypeIdByCode.get("PLAYER_POINTS")!,
    marketTypeName: "Points",
    period: "full_game",
    sportsbookId: 0,
    quote: {
      key: "player_points",
      lastUpdate: now.toISOString(),
      outcomes: [
        { name: "Over", price: -110, point: 26.5 },
        { name: "Under", price: -110, point: 26.5 },
      ],
    },
  });
  const [overLebron255Target, underLebron255Target] = lebron255;
  const [overLebron265Target, underLebron265Target] = lebron265;

  // 25.5 line: DraftKings -115, FanDuel +100, BetMGM -105 -- FanDuel is best (spec example)
  await snapshot(overLebron255Target.outcomeId, "draftkings", -115, now);
  await snapshot(overLebron255Target.outcomeId, "fanduel", 100, now);
  await snapshot(overLebron255Target.outcomeId, "betmgm", -105, now);
  await snapshot(underLebron255Target.outcomeId, "draftkings", -105, now);
  await snapshot(underLebron255Target.outcomeId, "fanduel", -130, now);
  await snapshot(underLebron255Target.outcomeId, "betmgm", -110, now);
  // 26.5 line: only BetMGM offers it -- a completely separate line, not comparable to 25.5
  await snapshot(overLebron265Target.outcomeId, "betmgm", -110, now);
  await snapshot(underLebron265Target.outcomeId, "betmgm", -110, now);

  // ---- 4) Two-way moneyline arbitrage: Nuggets @ Bucks -----------------
  const arbMoneyline = await matcher.resolveGameMarketOutcomes({
    eventId: nuggetsBucks.eventId,
    leagueId: nbaLeagueId,
    homeTeamId: nuggetsBucks.homeTeamId,
    awayTeamId: nuggetsBucks.awayTeamId,
    homeTeamName: "Milwaukee Bucks",
    awayTeamName: "Denver Nuggets",
    marketTypeId: marketTypeIdByCode.get("MONEYLINE")!,
    marketTypeName: "Moneyline",
    period: "full_game",
    sportsbookId: 0,
    quote: {
      key: "h2h",
      lastUpdate: now.toISOString(),
      outcomes: [
        { name: "Milwaukee Bucks", price: 150 },
        { name: "Denver Nuggets", price: 120 },
      ],
    },
  });
  const [bucksMl, nuggetsMl] = arbMoneyline;
  // Two different books pricing each side generously enough to create arbitrage
  const bucksSnap = await snapshot(bucksMl.outcomeId, "draftkings", 150, now); // 2.5 decimal
  const nuggetsSnap = await snapshot(nuggetsMl.outcomeId, "fanduel", 120, now); // 2.2 decimal
  await snapshot(bucksMl.outcomeId, "fanduel", -140, now);
  await snapshot(nuggetsMl.outcomeId, "draftkings", -130, now);

  const twoWayArb = detectArbitrage([
    { outcomeKey: "bucks", sportsbookId: sbId("draftkings"), decimalOdds: 2.5 },
    { outcomeKey: "nuggets", sportsbookId: sbId("fanduel"), decimalOdds: 2.2 },
  ]);
  if (twoWayArb.isArbitrage) {
    const marketLine = await prisma.marketLine.findFirstOrThrow({ where: { id: bucksMl.marketLineId } });
    const opp = await prisma.arbitrageOpportunity.create({
      data: {
        marketLineId: marketLine.id,
        totalImpliedProbability: twoWayArb.totalImpliedProbability,
        profitPercent: twoWayArb.profitPercent,
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      },
    });
    await prisma.arbitrageLeg.create({
      data: { arbitrageOpportunityId: opp.id, oddsSnapshotId: bucksSnap.id, stakePercentage: twoWayArb.legs[0].stakePercentage },
    });
    await prisma.arbitrageLeg.create({
      data: { arbitrageOpportunityId: opp.id, oddsSnapshotId: nuggetsSnap.id, stakePercentage: twoWayArb.legs[1].stakePercentage },
    });
  }

  // ---- 5) Three-way soccer arbitrage: Arsenal vs Chelsea ------------------
  const soccerMoneyline = await matcher.resolveGameMarketOutcomes({
    eventId: arsenalChelsea.eventId,
    leagueId: eplLeagueId,
    homeTeamId: arsenalChelsea.homeTeamId,
    awayTeamId: arsenalChelsea.awayTeamId,
    homeTeamName: "Arsenal",
    awayTeamName: "Chelsea",
    marketTypeId: marketTypeIdByCode.get("MONEYLINE_3WAY")!,
    marketTypeName: "Moneyline",
    period: "full_game",
    sportsbookId: 0,
    quote: {
      key: "h2h",
      lastUpdate: now.toISOString(),
      outcomes: [
        { name: "Arsenal", price: 350 },
        { name: "Draw", price: 300 },
        { name: "Chelsea", price: 350 },
      ],
    },
  });
  const [arsenalOutcome, drawOutcome, chelseaOutcome] = soccerMoneyline;
  const arsenalSnap = await snapshot(arsenalOutcome.outcomeId, "draftkings", 350, now); // 4.5 decimal
  const drawSnap = await snapshot(drawOutcome.outcomeId, "fanduel", 300, now); // 4.0 decimal
  const chelseaSnap = await snapshot(chelseaOutcome.outcomeId, "betmgm", 350, now); // 4.5 decimal
  await snapshot(arsenalOutcome.outcomeId, "fanduel", 280, now);
  await snapshot(drawOutcome.outcomeId, "draftkings", 260, now);
  await snapshot(chelseaOutcome.outcomeId, "draftkings", 300, now);

  const threeWayArb = detectArbitrage([
    { outcomeKey: "arsenal", sportsbookId: sbId("draftkings"), decimalOdds: 4.5 },
    { outcomeKey: "draw", sportsbookId: sbId("fanduel"), decimalOdds: 4.0 },
    { outcomeKey: "chelsea", sportsbookId: sbId("betmgm"), decimalOdds: 4.5 },
  ]);
  if (threeWayArb.isArbitrage) {
    const opp = await prisma.arbitrageOpportunity.create({
      data: {
        marketLineId: arsenalOutcome.marketLineId,
        totalImpliedProbability: threeWayArb.totalImpliedProbability,
        profitPercent: threeWayArb.profitPercent,
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      },
    });
    for (const [leg, snap] of [
      [threeWayArb.legs[0], arsenalSnap],
      [threeWayArb.legs[1], drawSnap],
      [threeWayArb.legs[2], chelseaSnap],
    ] as const) {
      await prisma.arbitrageLeg.create({
        data: { arbitrageOpportunityId: opp.id, oddsSnapshotId: snap.id, stakePercentage: leg.stakePercentage },
      });
    }
  }

  // ---- 5b) Futures market: NBA Championship Winner (no single game event) ----
  const futuresTargets = await matcher.resolveFuturesOutcomes({
    leagueId: nbaLeagueId,
    marketTypeId: marketTypeIdByCode.get("FUTURES_WINNER")!,
    title: "NBA Championship Winner",
    sportsbookId: 0,
    quote: {
      key: "outrights",
      lastUpdate: now.toISOString(),
      outcomes: [
        { name: "Boston Celtics", price: 450 },
        { name: "Denver Nuggets", price: 700 },
        { name: "Los Angeles Lakers", price: 1200 },
      ],
    },
  });
  const [celticsFuture, nuggetsFuture, lakersFuture] = futuresTargets;
  await snapshot(celticsFuture.outcomeId, "draftkings", 450, now);
  await snapshot(celticsFuture.outcomeId, "fanduel", 425, now);
  await snapshot(nuggetsFuture.outcomeId, "draftkings", 700, now);
  await snapshot(nuggetsFuture.outcomeId, "fanduel", 750, now);
  await snapshot(lakersFuture.outcomeId, "draftkings", 1200, now);
  await snapshot(lakersFuture.outcomeId, "betmgm", 1100, now);

  // ---- 6) Fair probability + betting opportunity for the LeBron 25.5 Over ----
  // No-vig using DraftKings' own over/under (a single-book de-vig), then EV
  // vs. FanDuel's price -- demonstrates the full estimation -> EV pipeline.
  const dkOverImplied = decimalToImpliedProbability(roundDecimalOdds(americanToDecimal(-115)));
  const dkUnderImplied = decimalToImpliedProbability(roundDecimalOdds(americanToDecimal(-105)));
  const { fairProbabilityA: fairOverProb } = noVigProbabilityTwoWay(dkOverImplied, dkUnderImplied);

  const fairEstimate = await prisma.fairProbabilityEstimate.create({
    data: {
      outcomeId: overLebron255Target.outcomeId,
      probability: roundProbability(fairOverProb),
      estimationMethod: "NO_VIG",
      calculatedAt: now,
    },
  });

  const fanDuelSnapshot = await prisma.oddsSnapshot.findFirst({
    where: { outcomeId: overLebron255Target.outcomeId, sportsbookId: sbId("fanduel") },
    orderBy: { capturedAt: "desc" },
  });
  if (fanDuelSnapshot) {
    const decimalOdds = Number(fanDuelSnapshot.decimalOdds);
    const ev = expectedValue(fairOverProb, decimalOdds);
    const allCurrentPrices = await prisma.oddsSnapshot.findMany({
      where: { outcomeId: overLebron255Target.outcomeId, isCurrent: true },
    });
    const outlierResults = detectOutliers(
      allCurrentPrices.map((p) => ({ sportsbookId: p.sportsbookId, decimalOdds: Number(p.decimalOdds) })),
      "median"
    );
    const fanDuelOutlier = outlierResults.find((o) => o.sportsbookId === sbId("fanduel"));

    await prisma.bettingOpportunity.create({
      data: {
        oddsSnapshotId: fanDuelSnapshot.id,
        fairProbabilityEstimateId: fairEstimate.id,
        expectedValuePercent: ev * 100,
        edgePercent: (fairOverProb - decimalToImpliedProbability(decimalOdds)) * 100,
        outlierScore: fanDuelOutlier?.outlierScore ?? 0,
        bestPriceInMarket: true,
        calculatedAt: now,
      },
    });
  }

  // ---- 7) Promotions --------------------------------------------------
  await prisma.promotion.createMany({
    data: [
      {
        sportsbookId: sbId("draftkings"),
        name: "New User Bonus Bet",
        promotionType: "BONUS_BET",
        maxStake: 200,
        stakeReturned: false,
        active: true,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        notes: "Bet $5, get $200 in bonus bets on any market.",
      },
      {
        sportsbookId: sbId("fanduel"),
        name: "No Sweat First Bet",
        promotionType: "NO_SWEAT",
        maxStake: 300,
        stakeReturned: true,
        active: true,
        expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        notes: "First bet refunded as a bonus bet if it loses.",
      },
      {
        sportsbookId: sbId("betmgm"),
        name: "20% Profit Boost Token",
        promotionType: "PROFIT_BOOST",
        boostPercent: 20,
        maxStake: 100,
        minDecimalOdds: 1.5,
        stakeReturned: false,
        active: true,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        notes: "Applies to any single game parlay or straight bet.",
      },
      {
        sportsbookId: sbId("betrivers"),
        name: "Same Game Parlay Odds Boost",
        promotionType: "ODDS_BOOST",
        boostPercent: 25,
        maxStake: 50,
        minDecimalOdds: 2.0,
        maxDecimalOdds: 10.0,
        stakeReturned: false,
        active: true,
        expiresAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        notes: "Boosted odds on any 3+ leg same-game parlay.",
      },
    ],
  });

  // ---- 8) Sample placed bet (settled, for Bet Tracker demo) -----------
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "conradflick11@gmail.com" } });
  const dkOverSnapshot = await prisma.oddsSnapshot.findFirst({
    where: { outcomeId: overLebron255Target.outcomeId, sportsbookId: sbId("draftkings") },
  });
  if (dkOverSnapshot) {
    await prisma.placedBet.create({
      data: {
        userId: user.id,
        outcomeId: overLebron255Target.outcomeId,
        sportsbookId: sbId("draftkings"),
        oddsSnapshotId: dkOverSnapshot.id,
        stake: 25,
        americanOdds: -115,
        decimalOdds: dkOverSnapshot.decimalOdds,
        potentialProfit: (Number(dkOverSnapshot.decimalOdds) - 1) * 25,
        status: "PENDING",
        placedAt: now,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
