/**
 * Worker CLI entrypoint. Two modes:
 *
 *   npx tsx worker/poll.ts --once   -- run exactly one polling cycle and exit
 *                                       (use as a Render Cron Job).
 *   npx tsx worker/poll.ts          -- run continuously, sleeping between
 *                                       cycles for Settings.refreshFrequencySeconds
 *                                       (use as a Render Background Worker).
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { runOnDemandWorkerCycle } from "../src/lib/worker/runOnDemand";

const RUN_ONCE = process.argv.includes("--once");
const DEFAULT_REFRESH_SECONDS = 120;

let shuttingDown = false;
process.on("SIGTERM", () => {
  shuttingDown = true;
});
process.on("SIGINT", () => {
  shuttingDown = true;
});

async function runOnce(): Promise<void> {
  const result = await runOnDemandWorkerCycle(prisma);

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ...result,
    })
  );
  if (result.errors.length > 0) {
    console.warn(`Cycle completed with ${result.errors.length} error(s):`, result.errors);
  }
}

async function main(): Promise<void> {
  if (RUN_ONCE) {
    await runOnce();
    await prisma.$disconnect();
    return;
  }

  console.log("sybaubetting worker starting in continuous mode...");
  while (!shuttingDown) {
    try {
      await runOnce();
    } catch (err) {
      console.error("Worker cycle failed:", err);
    }

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const refreshSeconds = settings?.refreshFrequencySeconds ?? DEFAULT_REFRESH_SECONDS;
    for (let waited = 0; waited < refreshSeconds && !shuttingDown; waited++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log("sybaubetting worker shutting down.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Worker crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
