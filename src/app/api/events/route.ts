import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/api/respond";
import { prisma } from "@/lib/db/prisma";

const querySchema = z.object({
  league: z.coerce.number().int().positive().optional(),
  sport: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const { league, sport, limit } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

  const events = await prisma.event.findMany({
    where: {
      ...(league ? { leagueId: league } : {}),
      ...(sport ? { league: { sport: { slug: sport } } } : {}),
    },
    orderBy: { startTime: "asc" },
    take: limit ?? 100,
    include: { homeTeam: true, awayTeam: true, league: { include: { sport: true } } },
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      startTime: e.startTime.toISOString(),
      status: e.status,
      league: { id: e.league.id, name: e.league.name },
      sport: { id: e.league.sport.id, slug: e.league.sport.slug, name: e.league.sport.name },
      homeTeam: e.homeTeam.name,
      awayTeam: e.awayTeam.name,
    })),
  });
});
