import { z } from "zod";

export const betStatusSchema = z.enum(["PENDING", "WON", "LOST", "PUSH", "CASHED_OUT", "VOID"]);

export const createBetSchema = z.object({
  outcomeId: z.coerce.number().int().positive(),
  sportsbookId: z.coerce.number().int().positive(),
  promotionId: z.coerce.number().int().positive().optional().nullable(),
  oddsSnapshotId: z.coerce.number().int().positive().optional().nullable(),
  stake: z.coerce.number().positive(),
  americanOdds: z.coerce.number().int().refine((v) => v !== 0, "American odds cannot be 0"),
});

export const updateBetSchema = z.object({
  status: betStatusSchema.optional(),
  actualProfit: z.coerce.number().optional().nullable(),
  settledAt: z.coerce.date().optional(),
  closingDecimalOdds: z.coerce.number().gt(1).optional().nullable(),
  computeClosingLine: z.boolean().optional(),
});
