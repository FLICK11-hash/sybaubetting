import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/respond";
import { getDashboardData } from "@/lib/api/dashboard";

export const GET = withApiErrorHandling(async () => {
  const data = await getDashboardData();
  return NextResponse.json(data);
});
