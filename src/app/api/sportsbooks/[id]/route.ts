import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling, ApiError } from "@/lib/api/respond";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.object({
  active: z.boolean().optional(),
  isSharp: z.boolean().optional(),
});

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const sportsbookId = Number(id);
    if (!Number.isInteger(sportsbookId)) throw new ApiError("Invalid sportsbook id", 400);

    const body = patchSchema.parse(await request.json());
    const existing = await prisma.sportsbook.findUnique({ where: { id: sportsbookId } });
    if (!existing) throw new ApiError("Sportsbook not found", 404);

    const updated = await prisma.sportsbook.update({ where: { id: sportsbookId }, data: body });
    return NextResponse.json(updated);
  }
);
