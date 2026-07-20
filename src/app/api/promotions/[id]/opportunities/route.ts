import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling, ApiError } from "@/lib/api/respond";
import { getBestOpportunitiesForPromotion } from "@/lib/api/promotions";
import { prisma } from "@/lib/db/prisma";

const querySchema = z.object({ stake: z.coerce.number().positive().optional() });

export const GET = withApiErrorHandling(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const promotionId = Number(id);
    if (!Number.isInteger(promotionId)) throw new ApiError("Invalid promotion id", 400);

    const { stake } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const defaultStake = stake ?? (settings ? Number(settings.defaultStakeSize) : 25) ?? 25;

    const result = await getBestOpportunitiesForPromotion(promotionId, defaultStake || 25);
    return NextResponse.json(result);
  }
);
