import type { PrismaClient } from "@prisma/client";
import { findBestPrice } from "../odds/bestPrice";
import { detectOutliers } from "../odds/outliers";
import { consensusImpliedProbability, consensusDecimalOdds, ConsensusMethod } from "../odds/consensus";
import { noVigProbabilityTwoWay } from "../odds/noVig";
import { expectedValue, edge } from "../odds/expectedValue";
import { decimalToImpliedProbability, roundProbability } from "../odds/conversion";
import { staleCutoff, DEFAULT_MAX_QUOTE_AGE_SECONDS } from "../odds/freshness";

export interface RecalculateOptions {
  consensusMethod?: ConsensusMethod;
  /** Snapshots older than this are excluded, not just ones marked stale by a price change. Defaults to Settings.maxQuoteAgeSeconds' schema default. */
  maxQuoteAgeSeconds?: number;
}

type OutcomeWithLine = {
  id: number;
  marketLine: {
    marketId: number;
    lineValue: unknown;
    handicapTeamId: number | null;
    outcomes: { id: number }[];
  };
};

/**
 * Finds the other side of a two-outcome market, for no-vig de-vigging.
 * Moneylines and totals share a single MarketLine between both outcomes
 * (an Over and its Under, or both teams' moneyline), so the sibling is
 * right there in `marketLine.outcomes`. Spreads don't: each team's side of
 * the spread is deliberately stored as its own MarketLine (-1.5 and +1.5
 * are different `lineValue`s, see marketMatcher.ts), so the opposing side
 * has to be found on the mirror line within the same market instead.
 */
async function findOpposingOutcomeId(prisma: PrismaClient, outcome: OutcomeWithLine): Promise<number | null> {
  const sameLineSibling = outcome.marketLine.outcomes.find((o) => o.id !== outcome.id);
  if (sameLineSibling) return sameLineSibling.id;

  if (outcome.marketLine.lineValue === null || outcome.marketLine.handicapTeamId === null) return null;

  const mirrorLine = await prisma.marketLine.findFirst({
    where: {
      marketId: outcome.marketLine.marketId,
      lineValue: Number(outcome.marketLine.lineValue) * -1,
      handicapTeamId: { not: outcome.marketLine.handicapTeamId },
    },
    include: { outcomes: true },
  });
  return mirrorLine?.outcomes[0]?.id ?? null;
}

/**
 * Recompute consensus/outlier/fair-probability/EV for one outcome and
 * upsert a BettingOpportunity row per current snapshot. Fair-probability
 * method precedence: a configured sharp reference book's live price (most
 * direct signal) > no-vig de-vig of the market's two sides (best available
 * for a clean two-outcome market) > plain consensus (fallback for
 * single-sided props, futures entrants, or when no sharp book has quoted).
 * CUSTOM_MODEL estimates are entered manually via the API, not computed
 * here.
 */
export async function recalculateOutcomeOpportunities(
  prisma: PrismaClient,
  outcomeId: number,
  options: RecalculateOptions = {}
): Promise<void> {
  const consensusMethod = options.consensusMethod ?? "median";
  const maxQuoteAgeSeconds = options.maxQuoteAgeSeconds ?? DEFAULT_MAX_QUOTE_AGE_SECONDS;
  const now = new Date();
  const cutoff = staleCutoff(maxQuoteAgeSeconds, now);

  const outcome = await prisma.outcome.findUnique({
    where: { id: outcomeId },
    include: { marketLine: { include: { outcomes: true } } },
  });
  if (!outcome) return;

  const currentSnapshots = await prisma.oddsSnapshot.findMany({
    where: { outcomeId, isCurrent: true, receivedAt: { gte: cutoff } },
    include: { sportsbook: true },
  });
  if (currentSnapshots.length === 0) return;

  const bookPrices = currentSnapshots.map((s) => ({
    sportsbookId: s.sportsbookId,
    decimalOdds: Number(s.decimalOdds),
  }));
  const best = findBestPrice(bookPrices);
  const outlierResults = detectOutliers(bookPrices, consensusMethod);

  let fairProbability: number | null = null;
  let estimationMethod: "SHARP_REFERENCE" | "NO_VIG" | "CONSENSUS" | null = null;
  let referenceSportsbookId: number | null = null;

  const sharpSnapshot = currentSnapshots.find((s) => s.sportsbook.isSharp);
  if (sharpSnapshot) {
    fairProbability = Number(sharpSnapshot.impliedProbability);
    estimationMethod = "SHARP_REFERENCE";
    referenceSportsbookId = sharpSnapshot.sportsbookId;
  } else {
    const otherOutcomeId = await findOpposingOutcomeId(prisma, outcome);
    const otherSnapshots = otherOutcomeId
      ? await prisma.oddsSnapshot.findMany({
          where: { outcomeId: otherOutcomeId, isCurrent: true, receivedAt: { gte: cutoff } },
        })
      : [];
    if (otherSnapshots.length > 0) {
      const thisConsensusDecimal = consensusDecimalOdds(bookPrices, consensusMethod);
      const otherConsensusDecimal = consensusDecimalOdds(
        otherSnapshots.map((s) => ({ sportsbookId: s.sportsbookId, decimalOdds: Number(s.decimalOdds) })),
        consensusMethod
      );
      const { fairProbabilityA } = noVigProbabilityTwoWay(1 / thisConsensusDecimal, 1 / otherConsensusDecimal);
      fairProbability = fairProbabilityA;
      estimationMethod = "NO_VIG";
    }
    if (fairProbability === null) {
      fairProbability = consensusImpliedProbability(bookPrices, consensusMethod);
      estimationMethod = "CONSENSUS";
    }
  }

  const fairEstimate = await prisma.fairProbabilityEstimate.create({
    data: {
      outcomeId,
      probability: roundProbability(fairProbability),
      estimationMethod: estimationMethod!,
      referenceSportsbookId,
      calculatedAt: now,
    },
  });

  for (const snap of currentSnapshots) {
    const decimalOdds = Number(snap.decimalOdds);
    const ev = expectedValue(fairProbability, decimalOdds);
    const outlier = outlierResults.find((o) => o.sportsbookId === snap.sportsbookId);

    await prisma.bettingOpportunity.upsert({
      where: { oddsSnapshotId: snap.id },
      update: {
        fairProbabilityEstimateId: fairEstimate.id,
        expectedValuePercent: ev * 100,
        edgePercent: edge(fairProbability, decimalToImpliedProbability(decimalOdds)) * 100,
        outlierScore: outlier?.outlierScore ?? 0,
        bestPriceInMarket: best?.sportsbookId === snap.sportsbookId,
        calculatedAt: now,
      },
      create: {
        oddsSnapshotId: snap.id,
        fairProbabilityEstimateId: fairEstimate.id,
        expectedValuePercent: ev * 100,
        edgePercent: edge(fairProbability, decimalToImpliedProbability(decimalOdds)) * 100,
        outlierScore: outlier?.outlierScore ?? 0,
        bestPriceInMarket: best?.sportsbookId === snap.sportsbookId,
        calculatedAt: now,
      },
    });
  }
}
