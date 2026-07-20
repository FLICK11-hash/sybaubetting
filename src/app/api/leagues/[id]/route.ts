import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling, ApiError } from "@/lib/api/respond";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.object({ active: z.boolean() });

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const leagueId = Number(id);
    if (!Number.isInteger(leagueId)) throw new ApiError("Invalid league id", 400);

    const { active } = patchSchema.parse(await request.json());
    const existing = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!existing) throw new ApiError("League not found", 404);

    const league = await prisma.league.update({ where: { id: leagueId }, data: { active } });
    return NextResponse.json(league);
  }
);
