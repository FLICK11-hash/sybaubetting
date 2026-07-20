import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/respond";
import { prisma } from "@/lib/db/prisma";

export const GET = withApiErrorHandling(async () => {
  const sportsbooks = await prisma.sportsbook.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({
    sportsbooks: sportsbooks.map((sb) => ({
      id: sb.id,
      name: sb.name,
      slug: sb.slug,
      websiteUrl: sb.websiteUrl,
      active: sb.active,
      isSharp: sb.isSharp,
    })),
  });
});
