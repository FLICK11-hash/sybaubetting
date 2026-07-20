import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ApiError } from "./errors";
import { americanToDecimal, roundDecimalOdds } from "../odds/conversion";
import { consensusDecimalOdds } from "../odds/consensus";

const betInclude = {
  sportsbook: true,
  promotion: true,
  outcome: { include: { marketLine: { include: { market: { include: { event: true } } } } } },
} satisfies Prisma.PlacedBetInclude;

type BetWithRelations = Prisma.PlacedBetGetPayload<{ include: typeof betInclude }>;

const DEFAULT_USER_EMAIL = process.env.DEFAULT_USER_EMAIL ?? "conradflick11@gmail.com";

async function getDefaultUserId(): Promise<number> {
  const user = await prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    update: {},
    create: { email: DEFAULT_USER_EMAIL },
  });
  return user.id;
}

function serializeBet(bet: BetWithRelations) {
  return {
    id: bet.id,
    sportsbook: bet.sportsbook.name,
    promotion: bet.promotion?.name ?? null,
    event: bet.outcome.marketLine.market.event
      ? { id: bet.outcome.marketLine.market.event.id, name: bet.outcome.marketLine.market.event.name }
      : null,
    market: bet.outcome.marketLine.market.title,
    outcome: bet.outcome.label,
    line: bet.outcome.marketLine.lineValue !== null ? Number(bet.outcome.marketLine.lineValue) : null,
    americanOdds: bet.americanOdds,
    decimalOdds: Number(bet.decimalOdds),
    stake: Number(bet.stake),
    potentialProfit: Number(bet.potentialProfit),
    status: bet.status,
    placedAt: bet.placedAt.toISOString(),
    settledAt: bet.settledAt?.toISOString() ?? null,
    actualProfit: bet.actualProfit !== null ? Number(bet.actualProfit) : null,
    closingDecimalOdds: bet.closingDecimalOdds !== null ? Number(bet.closingDecimalOdds) : null,
    closingLineValuePercent: bet.closingLineValuePercent !== null ? Number(bet.closingLineValuePercent) : null,
  };
}

export async function listBets() {
  const bets = await prisma.placedBet.findMany({ orderBy: { placedAt: "desc" }, include: betInclude });
  return bets.map(serializeBet);
}

export interface CreateBetInput {
  outcomeId: number;
  sportsbookId: number;
  promotionId?: number | null;
  oddsSnapshotId?: number | null;
  stake: number;
  americanOdds: number;
}

export async function createBet(input: CreateBetInput) {
  const outcome = await prisma.outcome.findUnique({ where: { id: input.outcomeId } });
  if (!outcome) throw new ApiError("Unknown outcomeId", 400);

  const decimalOdds = roundDecimalOdds(americanToDecimal(input.americanOdds));
  const potentialProfit = Math.round((decimalOdds - 1) * input.stake * 100) / 100;
  const userId = await getDefaultUserId();

  const created = await prisma.placedBet.create({
    data: {
      userId,
      outcomeId: input.outcomeId,
      sportsbookId: input.sportsbookId,
      promotionId: input.promotionId ?? null,
      oddsSnapshotId: input.oddsSnapshotId ?? null,
      stake: input.stake,
      americanOdds: input.americanOdds,
      decimalOdds,
      potentialProfit,
      status: "PENDING",
    },
    include: betInclude,
  });
  return serializeBet(created);
}

export interface UpdateBetInput {
  status?: "PENDING" | "WON" | "LOST" | "PUSH" | "CASHED_OUT" | "VOID";
  actualProfit?: number | null;
  settledAt?: Date;
  closingDecimalOdds?: number | null;
  computeClosingLine?: boolean;
}

export async function updateBet(id: number, input: UpdateBetInput) {
  const existing = await prisma.placedBet.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Bet not found", 404);

  let closingDecimalOdds = input.closingDecimalOdds ?? undefined;

  if (input.computeClosingLine) {
    closingDecimalOdds = (await computeClosingLineForBet(id)) ?? undefined;
  }

  const closingLineValuePercent =
    closingDecimalOdds !== undefined && closingDecimalOdds !== null
      ? Math.round(((Number(existing.decimalOdds) / closingDecimalOdds - 1) * 100) * 100) / 100
      : undefined;

  const updated = await prisma.placedBet.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.actualProfit !== undefined ? { actualProfit: input.actualProfit } : {}),
      ...(input.status && input.status !== "PENDING" ? { settledAt: input.settledAt ?? new Date() } : {}),
      ...(closingDecimalOdds !== undefined ? { closingDecimalOdds } : {}),
      ...(closingLineValuePercent !== undefined ? { closingLineValuePercent } : {}),
    },
    include: betInclude,
  });
  return serializeBet(updated);
}

/**
 * Closing line = consensus decimal odds across current-at-the-time books for
 * this outcome, sampled as close to event start as the snapshot history
 * allows.
 */
async function computeClosingLineForBet(betId: number): Promise<number | null> {
  const bet = await prisma.placedBet.findUnique({
    where: { id: betId },
    include: { outcome: { include: { marketLine: { include: { market: { include: { event: true } } } } } } },
  });
  const event = bet?.outcome.marketLine.market.event;
  if (!bet || !event) return null;

  const snapshots = await prisma.oddsSnapshot.findMany({
    where: { outcomeId: bet.outcomeId, capturedAt: { lte: event.startTime } },
    orderBy: { capturedAt: "desc" },
    distinct: ["sportsbookId"],
    take: 20,
  });
  if (snapshots.length === 0) return null;

  return consensusDecimalOdds(
    snapshots.map((s) => ({ sportsbookId: s.sportsbookId, decimalOdds: Number(s.decimalOdds) })),
    "median"
  );
}
