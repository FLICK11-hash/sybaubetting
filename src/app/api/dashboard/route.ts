import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/respond";
import { getDashboardData } from "@/lib/api/dashboard";
import { getOrSetCache } from "@/lib/cache/withCache";

// The dashboard aggregates several queries across the whole dataset and is
// the most frequently polled page; a short cache window meaningfully cuts
// DB load without staling data beyond the worker's own refresh cadence.
const DASHBOARD_CACHE_TTL_SECONDS = 20;

export const GET = withApiErrorHandling(async () => {
  const data = await getOrSetCache("dashboard:v1", DASHBOARD_CACHE_TTL_SECONDS, getDashboardData);
  return NextResponse.json(data);
});
