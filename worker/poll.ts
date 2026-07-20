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
import { createProvider } from "../src/lib/providers/registry";
import { runWorkerCycle } from "../src/lib/worker/runCycle";
import type { ConsensusMethod } from "../src/lib/odds/consensus";

const RUN_ONCE = process.argv.includes("--once");
const DEFAULT_REFRESH_SECONDS = 120;

/**
 * Player props and futures each cost extra provider requests per cycle (one
 * call per event for props, one per league for futures). Real odds API
 * plans have a limited monthly quota, so both can be disabled via env vars
 * when the priority is game odds + bet tracking rather than full coverage.
 */
const INCLUDE_PLAYER_PROPS = process.env.INCLUDE_PLAYER_PROPS !== "false";
const INCLUDE_FUTURES = process.env.INCLUDE_FUTURES !== "false";

let shuttingDown = false;
process.on("SIGTERM", () => {
  shuttingDown = true;
});
process.on("SIGINT", () => {
  shuttingDown = true;
});

async function getApiProviderId(providerSlug: string): Promise<number> {
  const row = await prisma.apiProvider.findUnique({ where: { slug: providerSlug } });
  if (!row) {
    throw new Error(
      `No api_providers row for slug "${providerSlug}". Run \`npm run db:seed\` first, or add this provider to the seed data.`
    );
  }
  return row.id;
}

async function runOnce(): Promise<void> {
  const provider = createProvider();
  const apiProviderId = await getApiProviderId(provider.slug);

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const consensusMethod = (settings?.consensusMethod as ConsensusMethod) ?? "median";

  const result = await runWorkerCycle(prisma, provider, apiProviderId, {
    consensusMethod,
    includePlayerProps: INCLUDE_PLAYER_PROPS,
    includeFutures: INCLUDE_FUTURES,
  });

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
