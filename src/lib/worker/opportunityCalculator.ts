import type { PrismaClient } from "@prisma/client";
import { findBestPrice } from "../odds/bestPrice";
import { detectOutliers } from "../odds/outliers";
import { consensusImpliedProbability, consensusDecimalOdds, ConsensusMethod } from "../odds/consensus";
import { noVigProbabilityTwoWay } from "../odds/noVig";
import { expectedValue, edge } from "../odds/expectedValue";
import { decimalToImpliedProbability, roundProbability } from "../odds/conversion";

export interface RecalculateOptions {
  consensusMethod?: ConsensusMethod;
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
  const now = new Date();

  const outcome = await prisma.outcome.findUnique({
    where: { id: outcomeId },
    include: { marketLine: { include: { outcomes: true } } },
  });
  if (!outcome) return;

  const currentSnapshots = await prisma.oddsSnapshot.findMany({
    where: { outcomeId, isCurrent: true },
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
    const siblings = outcome.marketLine.outcomes;
    if (siblings.length === 2) {
      const otherOutcomeId = siblings.find((o) => o.id !== outcomeId)?.id;
      const otherSnapshots = otherOutcomeId
        ? await prisma.oddsSnapshot.findMany({ where: { outcomeId: otherOutcomeId, isCurrent: true } })
        : [];
      if (otherSnapshots.length > 0) {
        const thisConsensusDecimal = consensusDecimalOdds(bookPrices, consensusMethod);
        const otherConsensusDecimal = consensusDecimalOdds(
          otherSnapshots.map((s) => ({ sportsbookId: s.sportsbookId, decimalOdds: Number(s.decimalOdds) })),
          consensusMethod
        );
        const { fairProbabilityA } = noVigProbabilityTwoWay(
          1 / thisConsensusDecimal,
          1 / otherConsensusDecimal
        );
        fairProbability = fairProbabilityA;
        estimationMethod = "NO_VIG";
      }
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
