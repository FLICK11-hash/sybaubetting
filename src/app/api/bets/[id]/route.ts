import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling, ApiError } from "@/lib/api/respond";
import { updateBetSchema } from "@/lib/api/betSchemas";
import { updateBet } from "@/lib/api/bets";

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const betId = Number(id);
    if (!Number.isInteger(betId)) throw new ApiError("Invalid bet id", 400);

    const body = updateBetSchema.parse(await request.json());
    const bet = await updateBet(betId, body);
    return NextResponse.json(bet);
  }
);
