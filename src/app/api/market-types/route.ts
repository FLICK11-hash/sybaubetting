import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/respond";
import { prisma } from "@/lib/db/prisma";

export const GET = withApiErrorHandling(async () => {
  const marketTypes = await prisma.marketType.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return NextResponse.json({
    marketTypes: marketTypes.map((mt) => ({
      id: mt.id,
      code: mt.code,
      name: mt.name,
      category: mt.category,
      hasLine: mt.hasLine,
    })),
  });
});
