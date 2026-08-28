import "server-only";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import {
  createOwnedBrand,
  enrichBrandById,
} from "@/server/services/brand-ops.service";
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

export const createBrandAction = growthAction({
  description:
    "Create an owned brand (a client or Wander property) with just a name and optional website. The brand is connectable from birth (its client connect link exists immediately). Enrichment is a separate step — call brandWrite.enrich afterwards to pull the logo, tagline, and description from the website.",
  inputSchema: z.object({
    name: z.string().trim().min(1).max(200),
    website: z.string().trim().max(2000).optional(),
    brandType: z.enum(["company", "personal"]).optional(),
  }),
  execute: async (input, ctx) => {
    const brand = await createOwnedBrand({
      organizationId: ctx.orgId,
      ownerId: ctx.userId,
      name: input.name,
      website: input.website,
      brandType: input.brandType,
    });
    return {
      brandId: brand.id,
      slug: brand.slug,
      name: brand.name,
      path: `/app/brands/${brand.slug}`,
    };
  },
});

export const enrichBrandAction = growthAction({
  description:
    "Scrape a brand's website (Firecrawl) and write the logo, tagline, description, and page metadata onto the brand. Idempotent — re-running refreshes the same fields. Pass website to set or override the brand's URL in the same step.",
  inputSchema: z.object({
    brandId: z.string().trim().min(1),
    website: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .describe("Sets or overrides the brand's website before scraping."),
  }),
  execute: async (input, ctx) => {
    const brand = await db.query.brandTable.findFirst({
      where: eq(brandTable.id, input.brandId),
      columns: { id: true, organizationId: true },
    });
    if (brand?.organizationId !== ctx.orgId) {
      throw new Error("No access to this brand");
    }
    const result = await enrichBrandById(input.brandId, input.website);
    if (!result) throw new Error("Could not read that website");
    return {
      brandId: result.brand.id,
      name: result.brand.name,
      tagline: result.brand.tagline,
      description: result.brand.description,
      logo: result.brand.logo,
    };
  },
});
