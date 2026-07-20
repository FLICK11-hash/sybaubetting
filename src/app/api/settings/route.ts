import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/respond";
import { updateSettingsSchema } from "@/lib/api/settingsSchemas";
import { prisma } from "@/lib/db/prisma";

function serialize(settings: NonNullable<Awaited<ReturnType<typeof prisma.settings.findUnique>>>) {
  return {
    refreshFrequencySeconds: settings.refreshFrequencySeconds,
    minEvPercentThreshold: Number(settings.minEvPercentThreshold),
    maxQuoteAgeSeconds: settings.maxQuoteAgeSeconds,
    bankroll: Number(settings.bankroll),
    defaultStakeSize: Number(settings.defaultStakeSize),
    consensusMethod: settings.consensusMethod,
    updatedAt: settings.updatedAt.toISOString(),
    // The odds provider API key is never stored in the database or sent to
    // the browser -- only whether the server has one configured.
    oddsApiKeyConfigured: Boolean(process.env.ODDS_API_KEY),
    oddsApiProvider: process.env.ODDS_API_PROVIDER ?? "the-odds-api",
  };
}

export const GET = withApiErrorHandling(async () => {
  const settings = await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  return NextResponse.json(serialize(settings));
});

export const PUT = withApiErrorHandling(async (request: NextRequest) => {
  const body = updateSettingsSchema.parse(await request.json());
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: body,
    create: { id: 1, ...body },
  });
  return NextResponse.json(serialize(settings));
});
