import type { PrismaClient } from "@prisma/client";
import type { OddsProvider, ProviderEventOdds } from "../providers/types";
import { MarketMatcher } from "../normalization/marketMatcher";
import { parsePeriodFromMarketKey } from "../normalization/periods";
import { resolveMarketTypeCode } from "../normalization/marketTypeCatalog";
import { GAME_MARKET_KEYS, playerPropMarketKeysForSport } from "./marketKeysBySport";
import { writeOddsSnapshot } from "./snapshotWriter";
import { TRACKING_WINDOW_MS } from "../odds/trackingWindow";

export interface IngestStats {
  eventsProcessed: number;
  snapshotsWritten: number;
  snapshotsUnchanged: number;
  errors: string[];
  touchedOutcomeIds: Set<number>;
  touchedMarketLineIds: Set<number>;
}

function newStats(): IngestStats {
  return {
    eventsProcessed: 0,
    snapshotsWritten: 0,
    snapshotsUnchanged: 0,
    errors: [],
    touchedOutcomeIds: new Set(),
    touchedMarketLineIds: new Set(),
  };
}

export function mergeStats(a: IngestStats, b: IngestStats): IngestStats {
  return {
    eventsProcessed: a.eventsProcessed + b.eventsProcessed,
    snapshotsWritten: a.snapshotsWritten + b.snapshotsWritten,
    snapshotsUnchanged: a.snapshotsUnchanged + b.snapshotsUnchanged,
    errors: [...a.errors, ...b.errors],
    touchedOutcomeIds: new Set([...a.touchedOutcomeIds, ...b.touchedOutcomeIds]),
    touchedMarketLineIds: new Set([...a.touchedMarketLineIds, ...b.touchedMarketLineIds]),
  };
}

interface LeagueContext {
  leagueId: number;
  leagueName: string;
  sportSlug: string;
  isSoccer: boolean;
  externalLeagueKey: string;
  externalFuturesKey?: string | null;
}

/** Leagues this provider covers, active in our DB. */
export async function getActiveLeaguesForProvider(
  prisma: PrismaClient,
  apiProviderId: number
): Promise<LeagueContext[]> {
  const providerLeagues = await prisma.providerLeague.findMany({
    where: { apiProviderId, active: true, league: { active: true } },
    include: { league: { include: { sport: true } } },
  });
  return providerLeagues.map((pl) => ({
    leagueId: pl.leagueId,
    leagueName: pl.league.name,
    sportSlug: pl.league.sport.slug,
    isSoccer: pl.league.sport.slug === "soccer",
    externalLeagueKey: pl.externalLeagueKey,
    externalFuturesKey: pl.externalFuturesKey,
  }));
}

async function ingestOneBookmakerMarket(
  prisma: PrismaClient,
  matcher: MarketMatcher,
  apiProviderId: number,
  stats: IngestStats,
  context: {
    eventId: number;
    leagueId: number;
    homeTeamId: number;
    awayTeamId: number;
    homeTeamName: string;
    awayTeamName: string;
    sportsbookId: number;
    capturedAt: Date;
  },
  providerMarketKey: string,
  outcomes: ProviderEventOdds["bookmakers"][number]["markets"][number]["outcomes"]
): Promise<void> {
  const { baseMarketKey, period } = parsePeriodFromMarketKey(providerMarketKey);
  const isThreeWayMoneyline = baseMarketKey === "h2h" && outcomes.length === 3;
  const code = resolveMarketTypeCode(baseMarketKey, { isThreeWayMoneyline });
  if (!code) return; // unsupported market key -- skip rather than fail the whole ingest

  const marketTypeId = await matcher.resolveMarketTypeId(code).catch(() => null);
  if (!marketTypeId) return;

  const marketTypeName = baseMarketKey.replace(/_/g, " ");
  const targets = await matcher.resolveGameMarketOutcomes({
    eventId: context.eventId,
    leagueId: context.leagueId,
    homeTeamId: context.homeTeamId,
    awayTeamId: context.awayTeamId,
    homeTeamName: context.homeTeamName,
    awayTeamName: context.awayTeamName,
    marketTypeId,
    marketTypeName,
    period,
    sportsbookId: context.sportsbookId,
    quote: { key: providerMarketKey, lastUpdate: context.capturedAt.toISOString(), outcomes },
  });

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const outcome = outcomes[i];
    const result = await writeOddsSnapshot(prisma, {
      outcomeId: target.outcomeId,
      sportsbookId: context.sportsbookId,
      apiProviderId,
      americanOdds: Math.round(outcome.price),
      capturedAt: context.capturedAt,
    });
    stats.touchedOutcomeIds.add(target.outcomeId);
    stats.touchedMarketLineIds.add(target.marketLineId);
    if (result.changed) stats.snapshotsWritten++;
    else stats.snapshotsUnchanged++;
  }
}

/** Ingest game-level odds (moneyline/spread/total, all periods) for one league. */
export async function ingestLeagueGameOdds(
  prisma: PrismaClient,
  provider: OddsProvider,
  apiProviderId: number,
  league: LeagueContext
): Promise<IngestStats> {
  const stats = newStats();
  const matcher = new MarketMatcher(prisma, apiProviderId);

  let events: ProviderEventOdds[];
  try {
    events = await provider.listEventOdds({ sportKey: league.externalLeagueKey, markets: GAME_MARKET_KEYS });
  } catch (err) {
    stats.errors.push(`listEventOdds(${league.externalLeagueKey}): ${(err as Error).message}`);
    return stats;
  }

  for (const providerEvent of events) {
    // Skip games already underway -- a pregame no-vig/consensus estimate is
    // meaningless once the score is in play, and mixing a live, fast-moving
    // price in with pregame prices from other books produces nonsensical
    // "value" (e.g. a book still quoting a frozen pregame underdog price
    // next to another book's real-time blowout line for the same outcome).
    const commenceTimeMs = new Date(providerEvent.commenceTime).getTime();
    if (commenceTimeMs <= Date.now()) continue;
    // Skip games more than a week out -- lines that far ahead are thin and
    // barely move, and just dilute this week's actual opportunities.
    if (commenceTimeMs > Date.now() + TRACKING_WINDOW_MS) continue;

    try {
      const { eventId, homeTeamId, awayTeamId } = await matcher.resolveEvent(league.leagueId, providerEvent);
      stats.eventsProcessed++;

      for (const bookmaker of providerEvent.bookmakers) {
        const sportsbookId = await matcher.resolveSportsbook(bookmaker.key);
        if (!sportsbookId) continue; // sportsbook not enabled/configured -- skip, don't fail

        const capturedAt = new Date(bookmaker.lastUpdate);
        for (const market of bookmaker.markets) {
          await ingestOneBookmakerMarket(
            prisma,
            matcher,
            apiProviderId,
            stats,
            {
              eventId,
              leagueId: league.leagueId,
              homeTeamId,
              awayTeamId,
              homeTeamName: providerEvent.homeTeam,
              awayTeamName: providerEvent.awayTeam,
              sportsbookId,
              capturedAt,
            },
            market.key,
            market.outcomes
          );
        }
      }
    } catch (err) {
      stats.errors.push(`event ${providerEvent.id}: ${(err as Error).message}`);
    }
  }

  return stats;
}

/** Ingest player props for every event in a league (one provider call per event). */
export async function ingestLeaguePlayerProps(
  prisma: PrismaClient,
  provider: OddsProvider,
  apiProviderId: number,
  league: LeagueContext
): Promise<IngestStats> {
  const stats = newStats();
  const matcher = new MarketMatcher(prisma, apiProviderId);
  const propMarkets = playerPropMarketKeysForSport(league.sportSlug);
  if (propMarkets.length === 0) return stats;

  const providerEvents = await prisma.providerEvent.findMany({
    where: {
      apiProviderId,
      event: {
        leagueId: league.leagueId,
        status: "SCHEDULED",
        startTime: { lte: new Date(Date.now() + TRACKING_WINDOW_MS) },
      },
    },
    include: { event: { include: { homeTeam: true, awayTeam: true } } },
  });

  for (const pe of providerEvents) {
    let eventOdds: ProviderEventOdds | null;
    try {
      eventOdds = await provider.listPlayerPropOdds({
        sportKey: league.externalLeagueKey,
        eventId: pe.externalEventId,
        markets: propMarkets,
      });
    } catch (err) {
      stats.errors.push(`listPlayerPropOdds(${pe.externalEventId}): ${(err as Error).message}`);
      continue;
    }
    if (!eventOdds) continue;
    stats.eventsProcessed++;

    for (const bookmaker of eventOdds.bookmakers) {
      const sportsbookId = await matcher.resolveSportsbook(bookmaker.key);
      if (!sportsbookId) continue;
      const capturedAt = new Date(bookmaker.lastUpdate);

      for (const market of bookmaker.markets) {
        const { baseMarketKey, period } = parsePeriodFromMarketKey(market.key);
        const code = resolveMarketTypeCode(baseMarketKey);
        if (!code) continue;
        const marketTypeId = await matcher.resolveMarketTypeId(code).catch(() => null);
        if (!marketTypeId) continue;

        // Player props are grouped by player name (the `description` field) within one market quote.
        const byPlayer = new Map<string, typeof market.outcomes>();
        for (const outcome of market.outcomes) {
          const playerName = outcome.description ?? outcome.name;
          const bucket = byPlayer.get(playerName) ?? [];
          bucket.push(outcome);
          byPlayer.set(playerName, bucket);
        }

        for (const [playerName, playerOutcomes] of byPlayer) {
          try {
            const playerId = await matcher.resolvePlayer(playerName, pe.event.homeTeamId);
            const targets = await matcher.resolvePlayerPropOutcomes({
              eventId: pe.eventId,
              leagueId: league.leagueId,
              playerId,
              playerName,
              marketTypeId,
              marketTypeName: baseMarketKey.replace(/^player_/, "").replace(/_/g, " "),
              period,
              sportsbookId,
              quote: { key: market.key, lastUpdate: market.lastUpdate, outcomes: playerOutcomes },
            });

            for (let i = 0; i < targets.length; i++) {
              const result = await writeOddsSnapshot(prisma, {
                outcomeId: targets[i].outcomeId,
                sportsbookId,
                apiProviderId,
                americanOdds: Math.round(playerOutcomes[i].price),
                capturedAt,
              });
              stats.touchedOutcomeIds.add(targets[i].outcomeId);
              stats.touchedMarketLineIds.add(targets[i].marketLineId);
              if (result.changed) stats.snapshotsWritten++;
              else stats.snapshotsUnchanged++;
            }
          } catch (err) {
            stats.errors.push(`player prop for "${playerName}": ${(err as Error).message}`);
          }
        }
      }
    }
  }

  return stats;
}

/** Ingest futures/outrights for a league (no per-event calls needed). */
export async function ingestLeagueFutures(
  prisma: PrismaClient,
  provider: OddsProvider,
  apiProviderId: number,
  league: LeagueContext
): Promise<IngestStats> {
  const stats = newStats();
  if (!league.externalFuturesKey) return stats;
  const matcher = new MarketMatcher(prisma, apiProviderId);

  let futuresEvents: ProviderEventOdds[];
  try {
    futuresEvents = await provider.listFuturesOdds({ sportKey: league.externalFuturesKey });
  } catch (err) {
    stats.errors.push(`listFuturesOdds(${league.externalFuturesKey}): ${(err as Error).message}`);
    return stats;
  }

  for (const futuresEvent of futuresEvents) {
    stats.eventsProcessed++;
    for (const bookmaker of futuresEvent.bookmakers) {
      const sportsbookId = await matcher.resolveSportsbook(bookmaker.key);
      if (!sportsbookId) continue;
      const capturedAt = new Date(bookmaker.lastUpdate);

      for (const market of bookmaker.markets) {
        const code = resolveMarketTypeCode(market.key);
        if (!code) continue;
        const marketTypeId = await matcher.resolveMarketTypeId(code).catch(() => null);
        if (!marketTypeId) continue;

        const targets = await matcher.resolveFuturesOutcomes({
          leagueId: league.leagueId,
          marketTypeId,
          title: `${league.leagueName} Championship Winner`,
          sportsbookId,
          quote: market,
        });

        for (let i = 0; i < targets.length; i++) {
          const result = await writeOddsSnapshot(prisma, {
            outcomeId: targets[i].outcomeId,
            sportsbookId,
            apiProviderId,
            americanOdds: Math.round(market.outcomes[i].price),
            capturedAt,
          });
          stats.touchedOutcomeIds.add(targets[i].outcomeId);
          stats.touchedMarketLineIds.add(targets[i].marketLineId);
          if (result.changed) stats.snapshotsWritten++;
          else stats.snapshotsUnchanged++;
        }
      }
    }
  }

  return stats;
}
