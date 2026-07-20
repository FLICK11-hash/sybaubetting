import type { PrismaClient } from "@prisma/client";
import type { OddsProvider } from "../providers/types";
import {
  getActiveLeaguesForProvider,
  ingestLeagueFutures,
  ingestLeagueGameOdds,
  ingestLeaguePlayerProps,
  IngestStats,
  mergeStats,
} from "./ingest";
import { recalculateOutcomeOpportunities } from "./opportunityCalculator";
import { expireStaleArbitrageOpportunities, recalculateMarketLineArbitrage } from "./arbitrageScanner";
import type { ConsensusMethod } from "../odds/consensus";

/** Stop starting new provider requests once remaining quota drops below this, to respect API rate limits. */
const MIN_REMAINING_REQUESTS_TO_CONTINUE = 5;

export interface WorkerCycleResult {
  provider: string;
  leaguesProcessed: number;
  eventsProcessed: number;
  snapshotsWritten: number;
  snapshotsUnchanged: number;
  outcomesRecalculated: number;
  marketLinesScannedForArbitrage: number;
  staleArbitrageExpired: number;
  errors: string[];
  rateLimitRemaining: number | null;
  durationMs: number;
}

export interface RunCycleOptions {
  consensusMethod?: ConsensusMethod;
  /** Skip player prop ingestion (useful for a faster/cheaper cycle). */
  includePlayerProps?: boolean;
  /** Skip futures ingestion (futures move slowly; doesn't need every cycle). */
  includeFutures?: boolean;
}

function rateLimitLow(provider: OddsProvider): boolean {
  const info = provider.getLastRateLimitInfo();
  return info.requestsRemaining !== null && info.requestsRemaining < MIN_REMAINING_REQUESTS_TO_CONTINUE;
}

/**
 * Runs one full polling cycle: fetch odds for every active league -> ingest
 * (normalize + snapshot) -> recalculate best price/consensus/fair
 * probability/EV for every touched outcome -> scan touched market lines for
 * arbitrage -> expire stale arbitrage opportunities. This is the function
 * the worker CLI (worker/poll.ts) and Render's scheduled job both call.
 */
export async function runWorkerCycle(
  prisma: PrismaClient,
  provider: OddsProvider,
  apiProviderId: number,
  options: RunCycleOptions = {}
): Promise<WorkerCycleResult> {
  const startedAt = Date.now();
  let stats: IngestStats = {
    eventsProcessed: 0,
    snapshotsWritten: 0,
    snapshotsUnchanged: 0,
    errors: [],
    touchedOutcomeIds: new Set(),
    touchedMarketLineIds: new Set(),
  };

  const leagues = await getActiveLeaguesForProvider(prisma, apiProviderId);
  let leaguesProcessed = 0;

  for (const league of leagues) {
    if (rateLimitLow(provider)) {
      stats.errors.push(`Stopped early: provider rate limit nearly exhausted before league ${league.leagueName}`);
      break;
    }

    const gameStats = await ingestLeagueGameOdds(prisma, provider, apiProviderId, league);
    stats = mergeStats(stats, gameStats);
    leaguesProcessed++;

    if (options.includePlayerProps !== false && !rateLimitLow(provider)) {
      const propStats = await ingestLeaguePlayerProps(prisma, provider, apiProviderId, league);
      stats = mergeStats(stats, propStats);
    }

    if (options.includeFutures !== false && !rateLimitLow(provider)) {
      const futuresStats = await ingestLeagueFutures(prisma, provider, apiProviderId, league);
      stats = mergeStats(stats, futuresStats);
    }
  }

  for (const outcomeId of stats.touchedOutcomeIds) {
    await recalculateOutcomeOpportunities(prisma, outcomeId, { consensusMethod: options.consensusMethod });
  }

  for (const marketLineId of stats.touchedMarketLineIds) {
    await recalculateMarketLineArbitrage(prisma, marketLineId);
  }

  const staleArbitrageExpired = await expireStaleArbitrageOpportunities(prisma);

  // upsert, not update -- the Settings singleton may not exist yet in every
  // environment (e.g. a fresh DB before `npm run db:seed`, or a test fixture
  // that doesn't seed it), and a missing row here shouldn't fail an
  // otherwise-successful cycle.
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { lastWorkerRunAt: new Date() },
    create: { id: 1, lastWorkerRunAt: new Date() },
  });

  return {
    provider: provider.slug,
    leaguesProcessed,
    eventsProcessed: stats.eventsProcessed,
    snapshotsWritten: stats.snapshotsWritten,
    snapshotsUnchanged: stats.snapshotsUnchanged,
    outcomesRecalculated: stats.touchedOutcomeIds.size,
    marketLinesScannedForArbitrage: stats.touchedMarketLineIds.size,
    staleArbitrageExpired,
    errors: stats.errors,
    rateLimitRemaining: provider.getLastRateLimitInfo().requestsRemaining,
    durationMs: Date.now() - startedAt,
  };
}
