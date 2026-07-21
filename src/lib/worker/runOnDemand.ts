import type { PrismaClient } from "@prisma/client";
import { createProvider } from "../providers/registry";
import { runWorkerCycle, WorkerCycleResult } from "./runCycle";
import type { ConsensusMethod } from "../odds/consensus";

const INCLUDE_PLAYER_PROPS = process.env.INCLUDE_PLAYER_PROPS !== "false";
const INCLUDE_FUTURES = process.env.INCLUDE_FUTURES !== "false";

/**
 * Resolves the configured provider + persisted settings and runs one worker
 * cycle. Shared by the CLI (worker/poll.ts) and the on-demand
 * `POST /api/worker/run` route, so "run a cycle right now" behaves
 * identically whether it's triggered from a terminal or the "Refresh odds"
 * button in the UI.
 */
export async function runOnDemandWorkerCycle(prisma: PrismaClient): Promise<WorkerCycleResult> {
  const provider = createProvider();

  const apiProviderRow = await prisma.apiProvider.findUnique({ where: { slug: provider.slug } });
  if (!apiProviderRow) {
    throw new Error(
      `No api_providers row for slug "${provider.slug}". Run \`npm run db:seed\` first, or add this provider to the seed data.`
    );
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const consensusMethod = (settings?.consensusMethod as ConsensusMethod) ?? "median";

  return runWorkerCycle(prisma, provider, apiProviderRow.id, {
    consensusMethod,
    includePlayerProps: INCLUDE_PLAYER_PROPS,
    includeFutures: INCLUDE_FUTURES,
    maxQuoteAgeSeconds: settings?.maxQuoteAgeSeconds,
  });
}
