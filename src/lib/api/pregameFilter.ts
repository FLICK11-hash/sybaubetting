import { Prisma } from "@prisma/client";
import { TRACKING_WINDOW_MS } from "../odds/trackingWindow";

/**
 * Restricts a query to markets that are still pregame and within this
 * week's tracking window (or have no event at all, i.e. futures):
 *
 * - Once an event's status flips to LIVE the worker stops updating its
 *   odds, so any remaining "current" snapshot is a frozen pregame price
 *   that can no longer actually be bet.
 * - A game starting more than a week out shouldn't have been ingested at
 *   all going forward (see src/lib/worker/ingest.ts), but this also keeps
 *   any older, already-ingested far-out game from showing immediately,
 *   without requiring a data reset.
 */
export function pregameMarketFilter(now: Date = new Date()): Prisma.MarketWhereInput {
  return {
    OR: [
      { eventId: null },
      { event: { status: "SCHEDULED", startTime: { lte: new Date(now.getTime() + TRACKING_WINDOW_MS) } } },
    ],
  };
}
