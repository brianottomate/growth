import { getBrandMapOutputSchema } from "./outputs/brand-map";
import "server-only";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { getBrandSurfaceSummary } from "@/server/services/brand-map.service";
import { growthAction } from "./types";

export const getBrandMap = growthAction({
  outputSchema: getBrandMapOutputSchema,
  description:
    "Read the shared Brand Map for one brand or every owned brand: live counts for channels, audience targets, website pages, blog articles, media, canonical content ideas, series, tracked peers, strategy targets, and pending structural reviews. Use this before cross-surface brand questions, when deciding what context is mapped vs missing, or before proposing what the team should do next.",
  inputSchema: z.object({
    brandId: z
      .string()
      .optional()
      .describe(
        "Optional brand id from listBrands. Omit to compare every owned brand.",
      ),
  }),
  execute: async (input, ctx) => {
    const brands = await db.query.brandTable.findMany({
      where: and(
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
        input.brandId ? eq(brandTable.id, input.brandId) : undefined,
      ),
      columns: { id: true, name: true, slug: true, type: true },
      orderBy: (table, { asc }) => [asc(table.name)],
    });

    if (input.brandId && brands.length === 0) {
      return {
        error:
          "That brand is not in this organization. Call listBrands to get a valid brandId.",
        brands: [],
      };
    }

    const mapped = await Promise.all(
      brands.map(async (brand) => ({
        ...brand,
        url: brand.slug ? `/app/brands/${brand.slug}` : "/app/brands",
        surfaces: await getBrandSurfaceSummary(brand.id),
      })),
    );

    return {
      brands: mapped,
      reviewUrl: "/app/review",
      guidance:
        "Mapped counts are confirmed durable structure. Zero or partial surfaces are gaps, not proof the brand lacks the underlying raw material.",
    };
  },
});
