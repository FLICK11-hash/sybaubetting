import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/respond";
import { prisma } from "@/lib/db/prisma";

export const GET = withApiErrorHandling(async () => {
  const sports = await prisma.sport.findMany({
    orderBy: { name: "asc" },
    include: { leagues: { orderBy: { name: "asc" } } },
  });
  return NextResponse.json({
    sports: sports.map((sport) => ({
      id: sport.id,
      name: sport.name,
      slug: sport.slug,
      active: sport.active,
      leagues: sport.leagues.map((l) => ({ id: l.id, name: l.name, active: l.active })),
    })),
  });
});
