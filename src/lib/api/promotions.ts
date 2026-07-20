import type { Prisma, PromotionType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ApiError } from "./errors";
import {
  evaluatePromotion,
  PromotionInput,
  BetInput,
  DEFAULT_BONUS_BET_CONVERSION_RATE,
} from "../promotions/calculator";
import { decimalToImpliedProbability } from "../odds/conversion";

export async function listPromotions() {
  const promotions = await prisma.promotion.findMany({
    orderBy: [{ active: "desc" }, { expiresAt: "asc" }],
    include: { sportsbook: true },
  });
  return promotions.map(serializePromotion);
}

type PromotionWithSportsbook = Prisma.PromotionGetPayload<{ include: { sportsbook: true } }>;

function serializePromotion(p: PromotionWithSportsbook) {
  return {
    id: p.id,
    sportsbook: p.sportsbook,
    name: p.name,
    promotionType: p.promotionType,
    boostPercent: p.boostPercent !== null ? Number(p.boostPercent) : null,
    maxStake: p.maxStake !== null ? Number(p.maxStake) : null,
    minDecimalOdds: p.minDecimalOdds !== null ? Number(p.minDecimalOdds) : null,
    maxDecimalOdds: p.maxDecimalOdds !== null ? Number(p.maxDecimalOdds) : null,
    stakeReturned: p.stakeReturned,
    startsAt: p.startsAt?.toISOString() ?? null,
    expiresAt: p.expiresAt?.toISOString() ?? null,
    active: p.active,
    notes: p.notes,
  };
}

export interface PromotionWriteInput {
  sportsbookId: number;
  name: string;
  promotionType: PromotionType;
  boostPercent?: number | null;
  maxStake?: number | null;
  minDecimalOdds?: number | null;
  maxDecimalOdds?: number | null;
  stakeReturned: boolean;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  active: boolean;
  notes?: string | null;
}

export async function createPromotion(input: PromotionWriteInput) {
  const sportsbook = await prisma.sportsbook.findUnique({ where: { id: input.sportsbookId } });
  if (!sportsbook) throw new ApiError("Unknown sportsbookId", 400);

  const created = await prisma.promotion.create({
    data: { ...input },
    include: { sportsbook: true },
  });
  return serializePromotion(created);
}

export async function updatePromotion(id: number, input: Partial<PromotionWriteInput>) {
  const existing = await prisma.promotion.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Promotion not found", 404);

  const updated = await prisma.promotion.update({
    where: { id },
    data: { ...input },
    include: { sportsbook: true },
  });
  return serializePromotion(updated);
}

export async function deletePromotion(id: number) {
  const existing = await prisma.promotion.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Promotion not found", 404);
  await prisma.promotion.delete({ where: { id } });
}

const CANDIDATE_LIMIT = 300;
const RESULT_LIMIT = 15;

/** Ranks the best current qualifying opportunities to use a given promotion, by expected profit. */
export async function getBestOpportunitiesForPromotion(promotionId: number, defaultStake: number) {
  const promotion = await prisma.promotion.findUnique({ where: { id: promotionId }, include: { sportsbook: true } });
  if (!promotion) throw new ApiError("Promotion not found", 404);

  const candidateSnapshots = await prisma.oddsSnapshot.findMany({
    where: { sportsbookId: promotion.sportsbookId, isCurrent: true },
    take: CANDIDATE_LIMIT,
    orderBy: { capturedAt: "desc" },
    include: {
      bettingOpportunity: { include: { fairProbabilityEstimate: true } },
      outcome: { include: { marketLine: { include: { market: { include: { event: true } } } } } },
    },
  });

  const promoInput: PromotionInput = {
    promotionType: promotion.promotionType,
    boostPercent: promotion.boostPercent !== null ? Number(promotion.boostPercent) : null,
    maxStake: promotion.maxStake !== null ? Number(promotion.maxStake) : null,
    minDecimalOdds: promotion.minDecimalOdds !== null ? Number(promotion.minDecimalOdds) : null,
    maxDecimalOdds: promotion.maxDecimalOdds !== null ? Number(promotion.maxDecimalOdds) : null,
    stakeReturned: promotion.stakeReturned,
    active: promotion.active,
    startsAt: promotion.startsAt,
    expiresAt: promotion.expiresAt,
  };

  const results = candidateSnapshots
    .map((snap) => {
      const decimalOdds = Number(snap.decimalOdds);
      const fairProbability = snap.bettingOpportunity?.fairProbabilityEstimate
        ? Number(snap.bettingOpportunity.fairProbabilityEstimate.probability)
        : decimalToImpliedProbability(decimalOdds); // fallback: book's own price, no de-vig available yet

      const stake = Math.min(defaultStake, promoInput.maxStake ?? defaultStake);
      const betInput: BetInput = { stake, decimalOdds, fairProbability };
      const evaluation = evaluatePromotion(promoInput, betInput, {
        bonusBetConversionRate: DEFAULT_BONUS_BET_CONVERSION_RATE,
      });

      return { snap, evaluation, stake };
    })
    .filter((r) => r.evaluation.qualifies)
    .sort((a, b) => b.evaluation.expectedProfit - a.evaluation.expectedProfit)
    .slice(0, RESULT_LIMIT);

  return {
    promotion: serializePromotion(promotion),
    opportunities: results.map((r) => ({
      event: r.snap.outcome.marketLine.market.event
        ? { id: r.snap.outcome.marketLine.market.event.id, name: r.snap.outcome.marketLine.market.event.name }
        : null,
      market: r.snap.outcome.marketLine.market.title,
      outcome: r.snap.outcome.label,
      americanOdds: r.snap.americanOdds,
      decimalOdds: Number(r.snap.decimalOdds),
      stake: r.stake,
      boostedDecimalOdds: Math.round(r.evaluation.boostedDecimalOdds * 10000) / 10000,
      expectedProfit: Math.round(r.evaluation.expectedProfit * 100) / 100,
      expectedValuePercent: Math.round(r.evaluation.expectedValuePercent * 100) / 100,
    })),
  };
}
