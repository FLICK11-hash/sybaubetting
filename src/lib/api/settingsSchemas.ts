import { z } from "zod";

export const updateSettingsSchema = z.object({
  refreshFrequencySeconds: z.coerce.number().int().min(30).max(3600).optional(),
  minEvPercentThreshold: z.coerce.number().optional(),
  maxQuoteAgeSeconds: z.coerce.number().int().min(30).max(86400).optional(),
  bankroll: z.coerce.number().min(0).optional(),
  defaultStakeSize: z.coerce.number().min(0).optional(),
  consensusMethod: z.enum(["median", "weighted_average"]).optional(),
});
