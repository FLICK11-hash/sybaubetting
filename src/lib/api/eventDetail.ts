import { prisma } from "../db/prisma";
import { consensusDecimalOdds } from "../odds/consensus";
import { ApiError } from "./errors";

export async function getEventDetail(eventId: number) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: { include: { sport: true } },
      homeTeam: true,
      awayTeam: true,
      markets: {
        include: {
          marketType: true,
          player: true,
          team: true,
          lines: {
            include: {
              outcomes: {
                include: {
                  oddsSnapshots: {
                    where: { isCurrent: true },
                    include: {
                      sportsbook: true,
                      bettingOpportunity: { include: { fairProbabilityEstimate: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!event) {
    throw new ApiError("Event not found", 404);
  }

  return {
    id: event.id,
    name: event.name,
    startTime: event.startTime.toISOString(),
    status: event.status,
    neutralSite: event.neutralSite,
    league: { id: event.league.id, name: event.league.name, sport: event.league.sport.name },
    homeTeam: { id: event.homeTeam.id, name: event.homeTeam.name },
    awayTeam: { id: event.awayTeam.id, name: event.awayTeam.name },
    markets: event.markets.map((market) => ({
      id: market.id,
      title: market.title,
      period: market.period,
      typeCode: market.marketType.code,
      typeName: market.marketType.name,
      subject: market.player ? market.player.name : market.team ? market.team.name : null,
      lines: market.lines.map((line) => {
        const outcomesWithPrices = line.outcomes.map((outcome) => {
          const snapshots = outcome.oddsSnapshots.filter((s) => s.sportsbook.active);
          const best = snapshots.length
            ? snapshots.reduce((a, b) => (Number(b.decimalOdds) > Number(a.decimalOdds) ? b : a))
            : null;
          const consensus = snapshots.length
            ? consensusDecimalOdds(
                snapshots.map((s) => ({ sportsbookId: s.sportsbookId, decimalOdds: Number(s.decimalOdds) })),
                "median"
              )
            : null;

          return {
            outcomeId: outcome.id,
            label: outcome.label,
            outcomeType: outcome.outcomeType,
            consensusDecimalOdds: consensus,
            fairProbability: best?.bettingOpportunity?.fairProbabilityEstimate
              ? Number(best.bettingOpportunity.fairProbabilityEstimate.probability)
              : null,
            prices: snapshots
              .sort((a, b) => Number(b.decimalOdds) - Number(a.decimalOdds))
              .map((s) => ({
                sportsbook: { id: s.sportsbook.id, name: s.sportsbook.name, slug: s.sportsbook.slug },
                americanOdds: s.americanOdds,
                decimalOdds: Number(s.decimalOdds),
                impliedProbability: Number(s.impliedProbability),
                expectedValuePercent: s.bettingOpportunity ? Number(s.bettingOpportunity.expectedValuePercent ?? 0) : null,
                outlierScore: s.bettingOpportunity ? Number(s.bettingOpportunity.outlierScore ?? 0) : null,
                isBestPrice: s.id === best?.id,
                lastUpdated: s.capturedAt.toISOString(),
              })),
          };
        });

        return {
          marketLineId: line.id,
          lineValue: line.lineValue !== null ? Number(line.lineValue) : null,
          outcomes: outcomesWithPrices,
        };
      }),
    })),
  };
}

const HISTORY_LIMIT = 200;

export async function getOutcomeOddsHistory(outcomeId: number) {
  const outcome = await prisma.outcome.findUnique({ where: { id: outcomeId } });
  if (!outcome) throw new ApiError("Outcome not found", 404);

  const snapshots = await prisma.oddsSnapshot.findMany({
    where: { outcomeId },
    orderBy: { capturedAt: "asc" },
    take: HISTORY_LIMIT,
    include: { sportsbook: true },
  });

  return {
    outcomeId,
    label: outcome.label,
    history: snapshots.map((s) => ({
      sportsbook: s.sportsbook.name,
      sportsbookId: s.sportsbookId,
      americanOdds: s.americanOdds,
      decimalOdds: Number(s.decimalOdds),
      impliedProbability: Number(s.impliedProbability),
      capturedAt: s.capturedAt.toISOString(),
    })),
  };
}
