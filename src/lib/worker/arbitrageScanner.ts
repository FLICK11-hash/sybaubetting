import type { PrismaClient } from "@prisma/client";
import { findBestPrice } from "../odds/bestPrice";
import { detectArbitrage } from "../odds/arbitrage";

/** Arbitrage windows close fast (any book can move a line at any time) — keep the window short. */
export const ARBITRAGE_OPPORTUNITY_TTL_MS = 5 * 60 * 1000;

/**
 * Scan one market line for arbitrage: every outcome on the line must have a
 * live price, and the number of outcomes must match the market type's
 * `expectedOutcomeCount` (2-way or 3-way) — futures and partially-posted
 * markets are skipped, matching "only markets where every possible outcome
 * is available."
 */
export async function recalculateMarketLineArbitrage(
  prisma: PrismaClient,
  marketLineId: number
): Promise<void> {
  const now = new Date();
  const marketLine = await prisma.marketLine.findUnique({
    where: { id: marketLineId },
    include: { market: { include: { marketType: true } }, outcomes: true },
  });
  if (!marketLine) return;
  if (marketLine.market.marketType.category !== "game") return;
  if (marketLine.outcomes.length !== marketLine.market.marketType.expectedOutcomeCount) return;

  const legs: { outcomeKey: string; sportsbookId: number; decimalOdds: number }[] = [];
  for (const outcome of marketLine.outcomes) {
    const snapshots = await prisma.oddsSnapshot.findMany({ where: { outcomeId: outcome.id, isCurrent: true } });
    if (snapshots.length === 0) {
      // Can't evaluate arbitrage without a live price on every leg.
      await expireActiveOpportunity(prisma, marketLineId, now);
      return;
    }
    const best = findBestPrice(
      snapshots.map((s) => ({ sportsbookId: s.sportsbookId, decimalOdds: Number(s.decimalOdds) }))
    )!;
    const bestSnapshot = snapshots.find((s) => s.sportsbookId === best.sportsbookId)!;
    legs.push({ outcomeKey: String(bestSnapshot.id), sportsbookId: best.sportsbookId, decimalOdds: best.decimalOdds });
  }

  const result = detectArbitrage(legs);

  if (!result.isArbitrage) {
    await expireActiveOpportunity(prisma, marketLineId, now);
    return;
  }

  await expireActiveOpportunity(prisma, marketLineId, now);
  const opportunity = await prisma.arbitrageOpportunity.create({
    data: {
      marketLineId,
      totalImpliedProbability: result.totalImpliedProbability,
      profitPercent: result.profitPercent,
      detectedAt: now,
      expiresAt: new Date(now.getTime() + ARBITRAGE_OPPORTUNITY_TTL_MS),
    },
  });
  for (const leg of result.legs) {
    await prisma.arbitrageLeg.create({
      data: {
        arbitrageOpportunityId: opportunity.id,
        oddsSnapshotId: Number(leg.outcomeKey),
        stakePercentage: leg.stakePercentage,
      },
    });
  }
}

async function expireActiveOpportunity(prisma: PrismaClient, marketLineId: number, now: Date): Promise<void> {
  await prisma.arbitrageOpportunity.updateMany({
    where: { marketLineId, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
}

/**
 * Sweep pass: expire any arbitrage opportunity whose expiry has already
 * passed, or that references a snapshot no longer marked current (the
 * price moved since detection). Run at the end of every worker cycle —
 * "do not treat stale opportunities as active."
 */
export async function expireStaleArbitrageOpportunities(prisma: PrismaClient): Promise<number> {
  const now = new Date();
  const stale = await prisma.arbitrageOpportunity.findMany({
    where: { expiresAt: { gt: now } },
    include: { legs: { include: { oddsSnapshot: true } } },
  });

  let expiredCount = 0;
  for (const opp of stale) {
    const hasStaleLeg = opp.legs.some((leg) => !leg.oddsSnapshot.isCurrent);
    if (hasStaleLeg) {
      await prisma.arbitrageOpportunity.update({ where: { id: opp.id }, data: { expiresAt: now } });
      expiredCount++;
    }
  }
  return expiredCount;
}
