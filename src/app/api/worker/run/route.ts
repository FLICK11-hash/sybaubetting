import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/respond";
import { prisma } from "@/lib/db/prisma";
import { runOnDemandWorkerCycle } from "@/lib/worker/runOnDemand";
import { invalidateCache } from "@/lib/cache/withCache";

/**
 * Runs one worker cycle synchronously and returns the result -- the same
 * work `npm run worker:once` does from a terminal, triggered instead from
 * the "Refresh odds now" button on the Dashboard. Gated by the same
 * APP_PASSWORD session check as every other route (see src/proxy.ts).
 */
export const POST = withApiErrorHandling(async () => {
  const result = await runOnDemandWorkerCycle(prisma);
  await invalidateCache("dashboard:v1");
  return NextResponse.json(result);
});
