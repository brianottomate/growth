import "server-only";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import {
  createOwnedBrand,
  enrichBrandById,
  previewBrandPurge,
  purgeBrand,
} from "@/server/services/brand-ops.service";
import {
  createProspectFromLead,
  setBrandRelationship,
} from "@/server/services/brand-relationship.service";
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

export const createProspectAction = growthAction({
  description:
    "Turn a row in the leads mirror into a prospect brand a rep can pitch, keyed on its domain so calling twice returns the brand that already exists. The mirror stays untouched. Follow with brandWrite.enrich to read their site for a logo and a tagline.",
  inputSchema: z.object({ domainId: z.string().min(1) }),
  outputSchema: z.object({
    brandId: z.string(),
    slug: z.string().nullable(),
    name: z.string(),
    /** False when this lead already had a brand. */
    created: z.boolean(),
  }),
  examples: [{ domainId: "ld_winterparkescapes" }],
  execute: async (input, ctx) => {
    const { brand, created } = await createProspectFromLead({
      organizationId: ctx.orgId,
      ownerId: ctx.userId,
      domainId: input.domainId,
    });
    return { brandId: brand.id, slug: brand.slug, name: brand.name, created };
  },
});

export const setBrandRelationshipAction = growthAction({
  description:
    "Set Wander's relationship to a brand: internal (one of ours), prospect (being pitched), client (paying), or reference (watched only). Use performanceWrite.promoteToClient instead when a customer has actually signed — that one also opens their commercial record.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    relationship: z.enum(["internal", "client", "prospect", "reference"]),
  }),
  outputSchema: z.object({
    brandId: z.string(),
    relationship: z.enum(["internal", "client", "prospect", "reference"]),
  }),
  examples: [{ brandId: "brand_winterpark", relationship: "prospect" }],
  execute: async (input, ctx) => {
    const brand = await setBrandRelationship({ orgId: ctx.orgId }, input);
    return { brandId: brand.id, relationship: brand.relationship };
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

/** Brand ownership check shared by the purge pair. */
async function assertOwnedBrand(brandId: string, orgId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
    ),
    columns: { id: true, name: true },
  });
  if (!brand) throw new Error("Brand not found in this organization.");
  return brand;
}

export const previewBrandPurgeAction = growthAction({
  description:
    "Show exactly what purging a brand would destroy: row counts per table, plus anything that blocks the purge (Performance+ accounts and partner programs are financial records and must be detached first). Read-only. Always call this before brandWrite.purge and show the operator the counts.",
  inputSchema: z.object({ brandId: z.string().trim().min(1) }),
  execute: async (input, ctx) => {
    await assertOwnedBrand(input.brandId, ctx.orgId);
    return previewBrandPurge(input.brandId);
  },
});

export const purgeBrandAction = growthAction({
  description:
    "Permanently delete a brand and everything under it: channels, campaigns, ads, audiences, content, media bytes in R2, the ad-account allowlist, and the Zernio profile with its connected accounts. This is offboarding, not archiving, and it CANNOT be undone. `confirmName` must match the brand's name exactly. Call brandWrite.previewPurge first and show the operator what will go. Never call this on your own initiative.",
  inputSchema: z.object({
    brandId: z.string().trim().min(1),
    confirmName: z
      .string()
      .trim()
      .min(1)
      .describe("Must equal the brand's name exactly, typed by the operator."),
  }),
  execute: async (input, ctx) => {
    await assertOwnedBrand(input.brandId, ctx.orgId);
    return purgeBrand(input);
  },
});
