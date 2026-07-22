import "server-only";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { growthAction } from "./types";

/** Brand ids for the org — shared by other org-scoped capabilities. */
export async function orgBrandIds(orgId: string): Promise<string[]> {
  const rows = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}

export const listBrands = growthAction({
  description:
    "List the brands in the current organization (id, name, tagline). Use when the operator asks about brands or you need a brand's name/id.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const brands = await db.query.brandTable.findMany({
      where: and(
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, name: true, tagline: true },
    });
    return { brands };
  },
});
