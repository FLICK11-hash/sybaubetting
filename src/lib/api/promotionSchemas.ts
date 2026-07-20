import { z } from "zod";

export const promotionTypeSchema = z.enum([
  "PROFIT_BOOST",
  "BONUS_BET",
  "NO_SWEAT",
  "ODDS_BOOST",
  "DEPOSIT_BONUS",
  "BET_CREDIT",
]);

export const createPromotionSchema = z.object({
  sportsbookId: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200),
  promotionType: promotionTypeSchema,
  boostPercent: z.coerce.number().min(0).max(1000).optional().nullable(),
  maxStake: z.coerce.number().positive().optional().nullable(),
  minDecimalOdds: z.coerce.number().gt(1).optional().nullable(),
  maxDecimalOdds: z.coerce.number().gt(1).optional().nullable(),
  stakeReturned: z.boolean().default(false),
  startsAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  active: z.boolean().default(true),
  notes: z.string().max(2000).optional().nullable(),
});

export const updatePromotionSchema = createPromotionSchema.partial();
