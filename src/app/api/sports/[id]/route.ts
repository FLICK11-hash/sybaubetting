import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling, ApiError } from "@/lib/api/respond";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.object({ active: z.boolean() });

/** Toggling a sport's active flag cascades to all its leagues, since the worker only checks league.active. */
export const PATCH = withApiErrorHandling(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const sportId = Number(id);
    if (!Number.isInteger(sportId)) throw new ApiError("Invalid sport id", 400);

    const { active } = patchSchema.parse(await request.json());
    const existing = await prisma.sport.findUnique({ where: { id: sportId } });
    if (!existing) throw new ApiError("Sport not found", 404);

    const [sport] = await prisma.$transaction([
      prisma.sport.update({ where: { id: sportId }, data: { active } }),
      prisma.league.updateMany({ where: { sportId }, data: { active } }),
    ]);
    return NextResponse.json(sport);
  }
);
