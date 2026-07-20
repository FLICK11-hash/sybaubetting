import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/respond";
import { createBetSchema } from "@/lib/api/betSchemas";
import { createBet, listBets } from "@/lib/api/bets";

export const GET = withApiErrorHandling(async () => {
  const bets = await listBets();
  return NextResponse.json({ bets });
});

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = createBetSchema.parse(await request.json());
  const bet = await createBet(body);
  return NextResponse.json(bet, { status: 201 });
});
