import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/api/respond";
import { prisma } from "@/lib/db/prisma";

const querySchema = z.object({
  stake: z.coerce.number().positive().default(1000),
});

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const { stake } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const now = new Date();

  const opportunities = await prisma.arbitrageOpportunity.findMany({
    where: { expiresAt: { gt: now } },
    orderBy: { profitPercent: "desc" },
    include: {
      marketLine: { include: { market: { include: { event: true, marketType: true } } } },
      legs: { include: { oddsSnapshot: { include: { sportsbook: true, outcome: true } } } },
    },
  });

  const rows = opportunities.map((opp) => ({
    id: opp.id,
    market: opp.marketLine.market.title,
    marketType: opp.marketLine.market.marketType.name,
    event: opp.marketLine.market.event
      ? {
          id: opp.marketLine.market.event.id,
          name: opp.marketLine.market.event.name,
          startTime: opp.marketLine.market.event.startTime.toISOString(),
        }
      : null,
    totalImpliedProbability: Number(opp.totalImpliedProbability),
    profitPercent: Number(opp.profitPercent),
    detectedAt: opp.detectedAt.toISOString(),
    expiresAt: opp.expiresAt.toISOString(),
    quoteAgeSeconds: Math.round((now.getTime() - opp.detectedAt.getTime()) / 1000),
    legs: opp.legs.map((leg) => {
      const stakePercentage = Number(leg.stakePercentage);
      return {
        sportsbook: leg.oddsSnapshot.sportsbook.name,
        outcome: leg.oddsSnapshot.outcome.label,
        americanOdds: leg.oddsSnapshot.americanOdds,
        decimalOdds: Number(leg.oddsSnapshot.decimalOdds),
        stakePercentage,
        suggestedStake: Math.round(stakePercentage * stake * 100) / 100,
      };
    }),
  }));

  return NextResponse.json({ stake, rows });
});
