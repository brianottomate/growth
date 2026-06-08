import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  type Brand,
  BRAND_LINK_CATEGORIES,
  brandInspirationTable,
  brandTable,
  brandTypeEnum,
  inspirationPurposeEnum,
  memberTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { type db } from "@/server/db";
import { enrichBrandFromWebsite } from "@/server/services/brand-enrichment.service";

type Ctx = {
  db: typeof db;
  session: { user: { id: string } };
};

/** Org ids the current user belongs to. */
async function userOrgIds(ctx: Ctx): Promise<string[]> {
  const memberships = await ctx.db.query.memberTable.findMany({
    where: eq(memberTable.userId, ctx.session.user.id),
  });
  return memberships.map((m) => m.organizationId);
}

/**
 * Assert the user can manage `brandId` and return the brand.
 *
 * - Owned brand (organizationId set): user must be a member of that org.
 * - Reference brand (organizationId NULL): user must own a brand that tracks it.
 */
async function assertBrandManageable(ctx: Ctx, brandId: string): Promise<Brand> {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
  }

  const orgIds = await userOrgIds(ctx);

  if (brand.organizationId) {
    if (!orgIds.includes(brand.organizationId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No access to this brand" });
    }
    return brand;
  }

  // Reference brand — must be tracked by one of the user's owned brands.
  const link = await ctx.db.query.brandInspirationTable.findFirst({
    where: eq(brandInspirationTable.inspirationBrandId, brandId),
    with: { brand: true },
  });
  const ownerOrg = link?.brand?.organizationId;
  if (!ownerOrg || !orgIds.includes(ownerOrg)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No access to this brand" });
  }
  return brand;
}

/** Ensure a URL has a protocol; null out empties. */
function normalizeWebsite(url?: string): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** URL-safe slug from a brand name (used in routes, stable across reseeds). */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "brand"
  );
}

/** Scrape `website` and write the results onto the brand. Returns the brand. */
async function applyEnrichment(
  ctx: Ctx,
  brandId: string,
  website: string,
): Promise<Brand | null> {
  const enrichment = await enrichBrandFromWebsite(website);
  if (!enrichment) return null;

  const [updated] = await ctx.db
    .update(brandTable)
    .set({
      ...(enrichment.tagline && { tagline: enrichment.tagline }),
      ...(enrichment.description && { description: enrichment.description }),
      ...(enrichment.logo && { logo: enrichment.logo }),
      websiteMeta: enrichment.websiteMeta,
    })
    .where(eq(brandTable.id, brandId))
    .returning();
  return updated ?? null;
}

export const brandRouter = createTRPCRouter({
  /**
   * Create a brand. Two scopes:
   * - `owned`: a top-level brand for the user's org (company/personal).
   * - `reference`: a tracked competitor/inspiration brand, linked to an owned
   *   brand via `brand_inspiration`. Deduped by website when one is provided.
   *
   * If a website is given and `enrich` isn't false, scrapes it inline.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(200),
        scope: z.enum(["owned", "reference"]),
        website: z.string().trim().max(2000).optional(),
        // owned
        brandType: z.enum(brandTypeEnum.enumValues).optional(),
        // reference
        ownerBrandId: z.string().optional(),
        purpose: z.enum(inspirationPurposeEnum.enumValues).optional(),
        enrich: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const website = normalizeWebsite(input.website);
      const shouldEnrich = input.enrich !== false;

      if (input.scope === "owned") {
        const [orgId] = await userOrgIds(ctx);
        if (!orgId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You must belong to an organization to create a brand",
          });
        }
        // Unique slug within the org.
        let slug = slugify(input.name);
        const slugTaken = await ctx.db.query.brandTable.findFirst({
          where: and(
            eq(brandTable.organizationId, orgId),
            eq(brandTable.slug, slug),
          ),
        });
        if (slugTaken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

        const [brand] = await ctx.db
          .insert(brandTable)
          .values({
            id: createId("brand"),
            organizationId: orgId,
            ownerId: ctx.session.user.id,
            type: input.brandType ?? "company",
            name: input.name,
            slug,
            website,
          })
          .returning();
        if (brand && website && shouldEnrich) {
          await applyEnrichment(ctx, brand.id, website);
        }
        return brand;
      }

      // reference
      if (!input.ownerBrandId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ownerBrandId is required for a tracked brand",
        });
      }
      await assertBrandManageable(ctx, input.ownerBrandId);

      // Dedupe canonical reference rows by website so one Airbnb is shared.
      let reference = website
        ? await ctx.db.query.brandTable.findFirst({
            where: and(
              isNull(brandTable.organizationId),
              eq(brandTable.website, website),
            ),
          })
        : undefined;

      if (!reference) {
        [reference] = await ctx.db
          .insert(brandTable)
          .values({
            id: createId("brand"),
            name: input.name,
            website,
            type: "company",
          })
          .returning();
      }

      if (!reference) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create reference brand",
        });
      }

      await ctx.db
        .insert(brandInspirationTable)
        .values({
          id: createId("insp"),
          brandId: input.ownerBrandId,
          inspirationBrandId: reference.id,
          purpose: input.purpose ?? "inspiration",
        })
        .onConflictDoNothing();

      if (website && shouldEnrich) await applyEnrichment(ctx, reference.id, website);
      return reference;
    }),

  /** Edit basic brand fields (owned or tracked). */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(200).optional(),
        tagline: z.string().trim().max(300).optional(),
        description: z.string().trim().max(5000).optional(),
        website: z.string().trim().max(2000).optional(),
        logo: z.string().trim().max(2000).optional(),
        links: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(200),
              url: z.string().trim().max(2000).optional(),
              category: z.enum(BRAND_LINK_CATEGORIES).optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.id);
      const [updated] = await ctx.db
        .update(brandTable)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.tagline !== undefined && { tagline: input.tagline || null }),
          ...(input.description !== undefined && {
            description: input.description || null,
          }),
          ...(input.website !== undefined && {
            website: normalizeWebsite(input.website),
          }),
          ...(input.logo !== undefined && { logo: input.logo || null }),
          ...(input.links !== undefined && { links: input.links }),
        })
        .where(eq(brandTable.id, input.id))
        .returning();
      return updated;
    }),

  /** Scrape the brand's website and refresh its fields. Runs inline. */
  enrich: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.id);
      if (!brand.website) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add a website URL before enriching",
        });
      }
      const updated = await applyEnrichment(ctx, brand.id, brand.website);
      if (!updated) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not read that website",
        });
      }
      return updated;
    }),

  /** Soft-delete an owned brand. Use `untrack` for reference brands. */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.id);
      if (!brand.organizationId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reference brands are removed by untracking them",
        });
      }
      await ctx.db
        .update(brandTable)
        .set({ deletedAt: new Date() })
        .where(eq(brandTable.id, input.id));
      return { id: input.id };
    }),

  /** Stop tracking a reference brand (deletes the link, not the brand). */
  untrack: protectedProcedure
    .input(z.object({ inspirationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.query.brandInspirationTable.findFirst({
        where: eq(brandInspirationTable.id, input.inspirationId),
      });
      if (!link) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tracking link not found" });
      }
      await assertBrandManageable(ctx, link.brandId);
      await ctx.db
        .delete(brandInspirationTable)
        .where(eq(brandInspirationTable.id, input.inspirationId));
      return { id: input.inspirationId };
    }),
});
