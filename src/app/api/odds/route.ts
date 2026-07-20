import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/api/respond";
import { queryOddsComparison } from "@/lib/api/oddsComparison";

const querySchema = z.object({
  sport: z.string().optional(),
  league: z.coerce.number().int().positive().optional(),
  event: z.coerce.number().int().positive().optional(),
  marketType: z.string().optional(),
  sportsbook: z.string().optional(),
  minOdds: z.coerce.number().positive().optional(),
  minEv: z.coerce.number().optional(),
  live: z.enum(["true", "false"]).optional(),
  player: z.string().optional(),
  startTimeFrom: z.coerce.date().optional(),
  startTimeTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const params = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

  const rows = await queryOddsComparison({
    sportSlug: params.sport,
    leagueId: params.league,
    eventId: params.event,
    marketTypeCode: params.marketType,
    sportsbookSlug: params.sportsbook,
    minDecimalOdds: params.minOdds,
    minEvPercent: params.minEv,
    live: params.live === undefined ? undefined : params.live === "true",
    playerName: params.player,
    startTimeFrom: params.startTimeFrom,
    startTimeTo: params.startTimeTo,
    limit: params.limit,
  });

  return NextResponse.json({ rows });
});
