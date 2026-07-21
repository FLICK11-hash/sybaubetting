import { Prisma } from "@prisma/client";

/**
 * Restricts a query to markets that are still pregame (or have no event at
 * all, i.e. futures) -- once an event's status flips to LIVE the worker
 * stops updating its odds, so any remaining "current" snapshot is a frozen
 * pregame price that can no longer actually be bet and shouldn't be
 * recommended as an opportunity or arbitrage leg.
 */
export const pregameMarketFilter: Prisma.MarketWhereInput = {
  OR: [{ eventId: null }, { event: { status: "SCHEDULED" } }],
};
