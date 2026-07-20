import { prisma } from "../db/prisma";

const TOP_N = 10;

function serializeOpportunity(opp: {
  id: number;
  expectedValuePercent: unknown;
  edgePercent: unknown;
  outlierScore: unknown;
  bestPriceInMarket: boolean;
  calculatedAt: Date;
  oddsSnapshot: {
    americanOdds: number;
    decimalOdds: unknown;
    sportsbook: { id: number; name: string; slug: string };
    outcome: {
      label: string;
      marketLine: {
        lineValue: unknown;
        market: { title: string; event: { id: number; name: string; startTime: Date } | null };
      };
    };
  };
}) {
  return {
    bettingOpportunityId: opp.id,
    event: opp.oddsSnapshot.outcome.marketLine.market.event
      ? {
          id: opp.oddsSnapshot.outcome.marketLine.market.event.id,
          name: opp.oddsSnapshot.outcome.marketLine.market.event.name,
          startTime: opp.oddsSnapshot.outcome.marketLine.market.event.startTime.toISOString(),
        }
      : null,
    market: opp.oddsSnapshot.outcome.marketLine.market.title,
    outcome: opp.oddsSnapshot.outcome.label,
    line:
      opp.oddsSnapshot.outcome.marketLine.lineValue !== null
        ? Number(opp.oddsSnapshot.outcome.marketLine.lineValue)
        : null,
    sportsbook: opp.oddsSnapshot.sportsbook,
    americanOdds: opp.oddsSnapshot.americanOdds,
    decimalOdds: Number(opp.oddsSnapshot.decimalOdds),
    expectedValuePercent: opp.expectedValuePercent !== null ? Number(opp.expectedValuePercent) : null,
    edgePercent: opp.edgePercent !== null ? Number(opp.edgePercent) : null,
    outlierScore: opp.outlierScore !== null ? Number(opp.outlierScore) : null,
    bestPriceInMarket: opp.bestPriceInMarket,
    calculatedAt: opp.calculatedAt.toISOString(),
  };
}

const opportunityInclude = {
  oddsSnapshot: {
    include: {
      sportsbook: true,
      outcome: { include: { marketLine: { include: { market: { include: { event: true } } } } } },
    },
  },
} as const;

export async function getDashboardData() {
  const now = new Date();

  const [topEv, bestLines, outliersDesc, outliersAsc, activeArbitrage, activePromotions, recentMarkets] =
    await Promise.all([
      prisma.bettingOpportunity.findMany({
        where: { expectedValuePercent: { gt: 0 }, oddsSnapshot: { isCurrent: true } },
        orderBy: { expectedValuePercent: "desc" },
        take: TOP_N,
        include: opportunityInclude,
      }),
      prisma.bettingOpportunity.findMany({
        where: { bestPriceInMarket: true, oddsSnapshot: { isCurrent: true } },
        orderBy: { outlierScore: "desc" },
        take: TOP_N,
        include: opportunityInclude,
      }),
      prisma.bettingOpportunity.findMany({
        where: { oddsSnapshot: { isCurrent: true } },
        orderBy: { outlierScore: "desc" },
        take: TOP_N,
        include: opportunityInclude,
      }),
      prisma.bettingOpportunity.findMany({
        where: { oddsSnapshot: { isCurrent: true } },
        orderBy: { outlierScore: "asc" },
        take: TOP_N,
        include: opportunityInclude,
      }),
      prisma.arbitrageOpportunity.findMany({
        where: { expiresAt: { gt: now } },
        orderBy: { profitPercent: "desc" },
        take: TOP_N,
        include: {
          marketLine: { include: { market: { include: { event: true } } } },
          legs: { include: { oddsSnapshot: { include: { sportsbook: true } } } },
        },
      }),
      prisma.promotion.findMany({
        where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        orderBy: { expiresAt: "asc" },
        take: TOP_N,
        include: { sportsbook: true },
      }),
      prisma.market.findMany({
        orderBy: { updatedAt: "desc" },
        take: TOP_N,
        include: { event: true, marketType: true },
      }),
    ]);

  const largestOutliers = [...outliersDesc, ...outliersAsc]
    .filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i)
    .sort((a, b) => Math.abs(Number(b.outlierScore ?? 0)) - Math.abs(Number(a.outlierScore ?? 0)))
    .slice(0, TOP_N);

  return {
    topExpectedValueOpportunities: topEv.map(serializeOpportunity),
    bestLineOpportunities: bestLines.map(serializeOpportunity),
    largestOutliers: largestOutliers.map(serializeOpportunity),
    activeArbitrage: activeArbitrage.map((arb) => ({
      id: arb.id,
      market: arb.marketLine.market.title,
      event: arb.marketLine.market.event
        ? { id: arb.marketLine.market.event.id, name: arb.marketLine.market.event.name }
        : null,
      totalImpliedProbability: Number(arb.totalImpliedProbability),
      profitPercent: Number(arb.profitPercent),
      detectedAt: arb.detectedAt.toISOString(),
      expiresAt: arb.expiresAt.toISOString(),
      legs: arb.legs.map((leg) => ({
        sportsbook: leg.oddsSnapshot.sportsbook.name,
        americanOdds: leg.oddsSnapshot.americanOdds,
        decimalOdds: Number(leg.oddsSnapshot.decimalOdds),
        stakePercentage: Number(leg.stakePercentage),
      })),
    })),
    activePromotions: activePromotions.map((p) => ({
      id: p.id,
      name: p.name,
      sportsbook: p.sportsbook.name,
      promotionType: p.promotionType,
      boostPercent: p.boostPercent !== null ? Number(p.boostPercent) : null,
      expiresAt: p.expiresAt?.toISOString() ?? null,
    })),
    recentlyUpdatedMarkets: recentMarkets.map((m) => ({
      id: m.id,
      title: m.title,
      marketType: m.marketType.name,
      event: m.event ? { id: m.event.id, name: m.event.name } : null,
      updatedAt: m.updatedAt.toISOString(),
    })),
  };
}
