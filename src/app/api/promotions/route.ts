import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/respond";
import { createPromotionSchema } from "@/lib/api/promotionSchemas";
import { createPromotion, listPromotions } from "@/lib/api/promotions";

export const GET = withApiErrorHandling(async () => {
  const promotions = await listPromotions();
  return NextResponse.json({ promotions });
});

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = createPromotionSchema.parse(await request.json());
  const promotion = await createPromotion(body);
  return NextResponse.json(promotion, { status: 201 });
});
