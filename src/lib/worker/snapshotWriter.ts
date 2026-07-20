import type { PrismaClient } from "@prisma/client";
import { americanToDecimal, decimalToImpliedProbability, roundDecimalOdds, roundProbability } from "../odds/conversion";

/**
 * Historical snapshots are still written periodically even when the price
 * hasn't changed, so line-movement charts have baseline points rather than
 * one giant gap. See "avoid inserting duplicate snapshots ... unless needed
 * for historical sampling" in the brief.
 */
export const UNCHANGED_ODDS_RESAMPLE_INTERVAL_MS = 30 * 60 * 1000;

export interface WriteSnapshotParams {
  outcomeId: number;
  sportsbookId: number;
  apiProviderId: number;
  americanOdds: number;
  available?: boolean;
  maxStake?: number | null;
  capturedAt: Date;
}

export interface WriteSnapshotResult {
  snapshotId: number;
  changed: boolean;
}

/**
 * Write a new odds snapshot for (outcome, sportsbook), skipping the insert
 * if the price is unchanged from the current snapshot and it's still recent
 * (per UNCHANGED_ODDS_RESAMPLE_INTERVAL_MS). When a new row IS inserted, the
 * previous "current" row for this outcome+sportsbook is flipped to
 * is_current=false in the same transaction — history is preserved, only the
 * "latest price" pointer moves.
 */
export async function writeOddsSnapshot(
  prisma: PrismaClient,
  params: WriteSnapshotParams
): Promise<WriteSnapshotResult> {
  const decimalOdds = roundDecimalOdds(americanToDecimal(params.americanOdds));
  const impliedProbability = roundProbability(decimalToImpliedProbability(decimalOdds));
  const available = params.available ?? true;

  const previous = await prisma.oddsSnapshot.findFirst({
    where: { outcomeId: params.outcomeId, sportsbookId: params.sportsbookId, isCurrent: true },
    orderBy: { capturedAt: "desc" },
  });

  if (previous) {
    const unchanged =
      previous.americanOdds === params.americanOdds &&
      previous.available === available &&
      Number(previous.maxStake ?? -1) === Number(params.maxStake ?? -1);
    const isRecent =
      params.capturedAt.getTime() - previous.capturedAt.getTime() < UNCHANGED_ODDS_RESAMPLE_INTERVAL_MS;

    if (unchanged && isRecent) {
      return { snapshotId: previous.id, changed: false };
    }
  }

  return prisma.$transaction(async (tx) => {
    if (previous) {
      await tx.oddsSnapshot.update({ where: { id: previous.id }, data: { isCurrent: false } });
    }
    const created = await tx.oddsSnapshot.create({
      data: {
        outcomeId: params.outcomeId,
        sportsbookId: params.sportsbookId,
        apiProviderId: params.apiProviderId,
        americanOdds: params.americanOdds,
        decimalOdds,
        impliedProbability,
        available,
        maxStake: params.maxStake ?? null,
        capturedAt: params.capturedAt,
        isCurrent: true,
      },
    });
    return { snapshotId: created.id, changed: true };
  });
}
