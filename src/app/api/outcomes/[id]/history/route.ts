import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling, ApiError } from "@/lib/api/respond";
import { getOutcomeOddsHistory } from "@/lib/api/eventDetail";

export const GET = withApiErrorHandling(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const outcomeId = Number(id);
    if (!Number.isInteger(outcomeId)) throw new ApiError("Invalid outcome id", 400);

    const history = await getOutcomeOddsHistory(outcomeId);
    return NextResponse.json(history);
  }
);
