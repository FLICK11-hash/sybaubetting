import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling, ApiError } from "@/lib/api/respond";
import { getEventDetail } from "@/lib/api/eventDetail";

export const GET = withApiErrorHandling(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId)) throw new ApiError("Invalid event id", 400);

    const event = await getEventDetail(eventId);
    return NextResponse.json(event);
  }
);
