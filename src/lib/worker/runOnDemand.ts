import type { PrismaClient } from "@prisma/client";
import { createProvider } from "../providers/registry";
import { MockOddsProvider } from "../providers/mock";
import { runWorkerCycle, WorkerCycleResult } from "./runCycle";
import type { ConsensusMethod } from "../odds/consensus";

const INCLUDE_PLAYER_PROPS = process.env.INCLUDE_PLAYER_PROPS !== "false";
const INCLUDE_FUTURES = process.env.INCLUDE_FUTURES !== "false";

/** Matches the-odds-api's (and most metered APIs') wording for "your plan's request quota is used up", across the status codes different providers use for it. */
export function looksLikeQuotaExhausted(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b(401|402|403|429)\b/.test(lower) &&
    (lower.includes("quota") || lower.includes("usage") || lower.includes("credit") || lower.includes("limit"))
  );
}

async function getApiProviderId(prisma: PrismaClient, slug: string): Promise<number> {
  const row = await prisma.apiProvider.findUnique({ where: { slug } });
  if (!row) {
    throw new Error(
      `No api_providers row for slug "${slug}". Run \`npm run db:seed\` first, or add this provider to the seed data.`
    );
  }
  return row.id;
}

/**
 * Resolves the configured provider + persisted settings and runs one worker
 * cycle. Shared by the CLI (worker/poll.ts) and the on-demand
 * `POST /api/worker/run` route, so "run a cycle right now" behaves
 * identically whether it's triggered from a terminal or the "Refresh odds"
 * button in the UI.
 *
 * If the configured real provider comes back with nothing and every error
 * looks like an exhausted request quota (rather than a one-off network
 * blip), automatically falls back to the mock provider for this cycle so
 * the app keeps producing something to look at instead of just erroring --
 * clearly flagged in the result so it's never mistaken for real odds.
 */
export async function runOnDemandWorkerCycle(prisma: PrismaClient): Promise<WorkerCycleResult> {
  const provider = createProvider();
  const apiProviderId = await getApiProviderId(prisma, provider.slug);

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const consensusMethod = (settings?.consensusMethod as ConsensusMethod) ?? "median";

  const result = await runWorkerCycle(prisma, provider, apiProviderId, {
    consensusMethod,
    includePlayerProps: INCLUDE_PLAYER_PROPS,
    includeFutures: INCLUDE_FUTURES,
    maxQuoteAgeSeconds: settings?.maxQuoteAgeSeconds,
  });

  const exhausted =
    provider.slug !== "mock-provider" &&
    result.eventsProcessed === 0 &&
    result.errors.length > 0 &&
    result.errors.every(looksLikeQuotaExhausted);

  if (!exhausted) return result;

  console.warn(
    `${provider.name} looks out of quota (${result.errors[0]}) -- falling back to the mock provider for this cycle.`
  );
  const mockProvider = new MockOddsProvider();
  const mockApiProviderId = await getApiProviderId(prisma, mockProvider.slug);
  const fallbackResult = await runWorkerCycle(prisma, mockProvider, mockApiProviderId, {
    consensusMethod,
    includePlayerProps: INCLUDE_PLAYER_PROPS,
    includeFutures: INCLUDE_FUTURES,
    maxQuoteAgeSeconds: settings?.maxQuoteAgeSeconds,
  });
  return {
    ...fallbackResult,
    errors: [
      `${provider.name} appears to be out of request quota -- used mock data for this cycle instead. Original error: ${result.errors[0]}`,
      ...fallbackResult.errors,
    ],
  };
}
