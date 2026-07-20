import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { consensusDecimalOdds } from "../odds/consensus";
import { decimalToAmerican } from "../odds/conversion";

export interface OddsComparisonFilters {
  sportSlug?: string;
  leagueId?: number;
  eventId?: number;
  marketTypeCode?: string;
  sportsbookSlug?: string;
  minDecimalOdds?: number;
  minEvPercent?: number;
  live?: boolean;
  playerName?: string;
  startTimeFrom?: Date;
  startTimeTo?: Date;
  limit?: number;
}

export interface OddsComparisonRow {
  outcomeId: number;
  event: { id: number; name: string; startTime: string; status: string } | null;
  market: { id: number; title: string; period: string; typeCode: string; typeName: string };
  subject: { type: "player" | "team" | "game"; id: number | null; name: string | null };
  outcome: { label: string; outcomeType: string };
  line: number | null;
  bestSportsbook: { id: number; name: string; slug: string } | null;
  bestAmericanOdds: number | null;
  bestDecimalOdds: number | null;
  consensusDecimalOdds: number | null;
  consensusAmericanOdds: number | null;
  impliedProbability: number | null;
  fairProbability: number | null;
  expectedValuePercent: number | null;
  outlierScore: number | null;
  isBestPrice: boolean;
  lastUpdated: string | null;
}

export async function queryOddsComparison(filters: OddsComparisonFilters): Promise<OddsComparisonRow[]> {
  const where: Prisma.OutcomeWhereInput = {
    marketLine: {
      market: {
        status: "OPEN",
        ...(filters.marketTypeCode ? { marketType: { code: filters.marketTypeCode } } : {}),
        ...(filters.leagueId ? { leagueId: filters.leagueId } : {}),
        ...(filters.eventId ? { eventId: filters.eventId } : {}),
        ...(filters.sportSlug ? { league: { sport: { slug: filters.sportSlug } } } : {}),
        ...(filters.playerName
          ? { player: { normalizedName: { contains: filters.playerName.toLowerCase() } } }
          : {}),
        ...(filters.live !== undefined || filters.startTimeFrom || filters.startTimeTo
          ? {
              event: {
                ...(filters.live !== undefined ? { status: filters.live ? "LIVE" : "SCHEDULED" } : {}),
                ...(filters.startTimeFrom || filters.startTimeTo
                  ? {
                      startTime: {
                        ...(filters.startTimeFrom ? { gte: filters.startTimeFrom } : {}),
                        ...(filters.startTimeTo ? { lte: filters.startTimeTo } : {}),
                      },
                    }
                  : {}),
              },
            }
          : {}),
      },
    },
  };

  const outcomes = await prisma.outcome.findMany({
    where,
    take: filters.limit ?? 200,
    orderBy: { id: "desc" },
    include: {
      player: true,
      team: true,
      marketLine: {
        include: {
          market: {
            include: {
              event: true,
              marketType: true,
              player: true,
              team: true,
            },
          },
        },
      },
      oddsSnapshots: {
        where: { isCurrent: true },
        include: { sportsbook: true, bettingOpportunity: { include: { fairProbabilityEstimate: true } } },
      },
    },
  });

  const rows: OddsComparisonRow[] = [];

  for (const outcome of outcomes) {
    let snapshots = outcome.oddsSnapshots.filter((s) => s.sportsbook.active);
    if (filters.sportsbookSlug) {
      snapshots = snapshots.filter((s) => s.sportsbook.slug === filters.sportsbookSlug);
    }
    if (snapshots.length === 0) continue;

    const best = snapshots.reduce((a, b) => (Number(b.decimalOdds) > Number(a.decimalOdds) ? b : a));
    const allCurrentForOutcome = outcome.oddsSnapshots.filter((s) => s.sportsbook.active);
    const consensus =
      allCurrentForOutcome.length > 0
        ? consensusDecimalOdds(
            allCurrentForOutcome.map((s) => ({ sportsbookId: s.sportsbookId, decimalOdds: Number(s.decimalOdds) })),
            "median"
          )
        : null;

    if (filters.minDecimalOdds && Number(best.decimalOdds) < filters.minDecimalOdds) continue;
    const evPercent = best.bettingOpportunity ? Number(best.bettingOpportunity.expectedValuePercent ?? 0) : null;
    if (filters.minEvPercent !== undefined && (evPercent === null || evPercent < filters.minEvPercent)) continue;

    const market = outcome.marketLine.market;
    const subject = market.playerId
      ? { type: "player" as const, id: market.playerId, name: market.player?.name ?? null }
      : market.teamId
        ? { type: "team" as const, id: market.teamId, name: market.team?.name ?? null }
        : { type: "game" as const, id: null, name: null };

    rows.push({
      outcomeId: outcome.id,
      event: market.event
        ? {
            id: market.event.id,
            name: market.event.name,
            startTime: market.event.startTime.toISOString(),
            status: market.event.status,
          }
        : null, // futures markets have no single game event
      market: {
        id: market.id,
        title: market.title,
        period: market.period,
        typeCode: market.marketType.code,
        typeName: market.marketType.name,
      },
      subject,
      outcome: { label: outcome.label, outcomeType: outcome.outcomeType },
      line: outcome.marketLine.lineValue !== null ? Number(outcome.marketLine.lineValue) : null,
      bestSportsbook: { id: best.sportsbook.id, name: best.sportsbook.name, slug: best.sportsbook.slug },
      bestAmericanOdds: best.americanOdds,
      bestDecimalOdds: Number(best.decimalOdds),
      consensusDecimalOdds: consensus,
      consensusAmericanOdds: consensus ? decimalToAmerican(consensus) : null,
      impliedProbability: Number(best.impliedProbability),
      fairProbability: best.bettingOpportunity?.fairProbabilityEstimate
        ? Number(best.bettingOpportunity.fairProbabilityEstimate.probability)
        : null,
      expectedValuePercent: evPercent,
      outlierScore: best.bettingOpportunity ? Number(best.bettingOpportunity.outlierScore ?? 0) : null,
      isBestPrice: best.bettingOpportunity?.bestPriceInMarket ?? false,
      lastUpdated: best.capturedAt.toISOString(),
    });
  }

  return rows;
}
