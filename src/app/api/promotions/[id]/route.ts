import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling, ApiError } from "@/lib/api/respond";
import { updatePromotionSchema } from "@/lib/api/promotionSchemas";
import { deletePromotion, updatePromotion } from "@/lib/api/promotions";

function parseId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError("Invalid promotion id", 400);
  return n;
}

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const body = updatePromotionSchema.parse(await request.json());
    const promotion = await updatePromotion(parseId(id), body);
    return NextResponse.json(promotion);
  }
);

export const DELETE = withApiErrorHandling(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    await deletePromotion(parseId(id));
    return new NextResponse(null, { status: 204 });
  }
);
