import { z } from "zod";
import { waitUntil } from "@vercel/functions";
import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  type Brand,
  BRAND_LINK_CATEGORIES,
  brandInspirationTable,
  brandTable,
  brandTypeEnum,
  type channelPlatformEnum,
  channelTable,
  inspirationPurposeEnum,
  memberTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { type db } from "@/server/db";
import { inspirationAddress } from "@/lib/inbound-email";
import { enrichBrandFromWebsite } from "@/server/services/brand-enrichment.service";
import {
  brandConnectUrl,
  brandIntakeUrl,
  ensureBrandConnect,
  getBrandConnectStatus,
  regenerateBrandConnectToken,
} from "@/server/services/brand-connect.service";
import {
  createOwnedBrand,
  enrichBrandById,
  previewBrandPurge,
  purgeBrand,
} from "@/server/services/brand-ops.service";
import { suggestNameFromEnrichment } from "@/server/services/brand-enrichment.service";
import {
  listBrandAdAccounts,
  setBrandAdAccountAllowed,
} from "@/server/services/brand-ad-accounts.service";
import { syncZernioAds } from "@/server/services/ads-sync.service";

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
async function assertBrandManageable(
  ctx: Ctx,
  brandId: string,
): Promise<Brand> {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
  }

  const orgIds = await userOrgIds(ctx);

  if (brand.organizationId) {
    if (!orgIds.includes(brand.organizationId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No access to this brand",
      });
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
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No access to this brand",
    });
  }
  return brand;
}

/** Ensure a URL has a protocol; null out empties. */
function normalizeWebsite(url?: string): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const trackedProfilePlatformEnum = z.enum([
  "linkedin",
  "instagram",
  "x",
  "facebook",
  "youtube",
  "tiktok",
  "threads",
  "reddit",
  "pinterest",
] satisfies (typeof channelPlatformEnum.enumValues)[number][]);

function normalizeProfileUrl(url?: string): string | null {
  return normalizeWebsite(url);
}

/** Best-effort handle extraction for a manually supplied public profile URL. */
export function handleFromProfileUrl(url: string): string | null {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const last = segments.at(-1)?.replace(/^@/, "").trim();
    return last || null;
  } catch {
    return null;
  }
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
        referenceType: z.enum(brandTypeEnum.enumValues).optional(),
        profile: z
          .object({
            platform: trackedProfilePlatformEnum,
            url: z.string().trim().max(2000),
          })
          .optional(),
        enrich: z.boolean().optional(),
        /** Pre-fetched preview from brand.previewEnrichment — saved inline. */
        enrichment: z
          .object({
            tagline: z.string().max(500).nullish(),
            description: z.string().max(4000).nullish(),
            logo: z.string().url().nullish(),
            websiteMeta: z
              .object({
                title: z.string().optional(),
                description: z.string().optional(),
                favicon: z.string().optional(),
                ogImage: z.string().optional(),
                scrapedAt: z.string().optional(),
              })
              .nullish(),
          })
          .nullish(),
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
        const brand = await createOwnedBrand({
          organizationId: orgId,
          ownerId: ctx.session.user.id,
          name: input.name,
          website,
          brandType: input.brandType,
          enrichment: input.enrichment,
        });
        // Without a pre-fetched preview, enrichment runs after the response
        // so create feels instant; the card fills in when the scrape lands.
        if (website && shouldEnrich && !input.enrichment) {
          waitUntil(
            enrichBrandById(brand.id).catch((error) => {
              console.error("brand enrichment failed", brand.id, error);
            }),
          );
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
      const profileUrl = normalizeProfileUrl(input.profile?.url);
      if (input.profile && !profileUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Profile URL must be a valid public URL",
        });
      }

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
            type: input.referenceType ?? "company",
          })
          .returning();
      } else if (
        input.referenceType &&
        reference.type !== input.referenceType
      ) {
        const [updated] = await ctx.db
          .update(brandTable)
          .set({ type: input.referenceType })
          .where(eq(brandTable.id, reference.id))
          .returning();
        reference = updated ?? reference;
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

      if (input.profile && profileUrl) {
        const existingChannel = await ctx.db.query.channelTable.findFirst({
          where: and(
            eq(channelTable.brandId, reference.id),
            eq(channelTable.platform, input.profile.platform),
            isNull(channelTable.deletedAt),
          ),
        });
        const handle = handleFromProfileUrl(profileUrl);
        if (existingChannel) {
          await ctx.db
            .update(channelTable)
            .set({
              profileUrl,
              handle: handle ?? existingChannel.handle,
              connectionStatus: "disconnected",
              isActive: true,
            })
            .where(eq(channelTable.id, existingChannel.id));
        } else {
          await ctx.db.insert(channelTable).values({
            id: createId("chan"),
            brandId: reference.id,
            kind: "social",
            platform: input.profile.platform,
            displayName:
              input.profile.platform === "linkedin" ? "LinkedIn" : undefined,
            handle,
            profileUrl,
            connectionStatus: "disconnected",
          });
        }
      }

      if (website && shouldEnrich) {
        await enrichBrandById(reference.id, website).catch((error) => {
          console.error("reference enrichment failed", reference.id, error);
        });
      }
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
          ...(input.tagline !== undefined && {
            tagline: input.tagline || null,
          }),
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
      const result = await enrichBrandById(brand.id);
      if (!result) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not read that website",
        });
      }
      return result.brand;
    }),

  /**
   * Scrape a website WITHOUT saving anything — the dialog's Enrich button.
   * The values come back to the client for preview and ride up again on
   * brand.create.
   */
  previewEnrichment: protectedProcedure
    .input(z.object({ website: z.string().trim().min(3).max(2000) }))
    .mutation(async ({ input }) => {
      const website = normalizeWebsite(input.website);
      if (!website) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a URL" });
      }
      const enrichment = await enrichBrandFromWebsite(website);
      if (!enrichment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not read that website",
        });
      }
      return {
        website,
        suggestedName: suggestNameFromEnrichment(enrichment),
        tagline: enrichment.tagline ?? null,
        description: enrichment.description ?? null,
        logo: enrichment.logo ?? null,
        websiteMeta: enrichment.websiteMeta,
      };
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

  /** What a purge would destroy, and anything blocking it. Read-only. */
  previewPurge: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return previewBrandPurge(input.brandId);
    }),

  /**
   * Offboarding: hard-delete the brand, its Zernio connection and its stored
   * bytes. `delete` above only stamps deletedAt; this is the one that actually
   * removes a client's data when they ask.
   */
  purge: protectedProcedure
    .input(z.object({ brandId: z.string(), confirmName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return purgeBrand(input);
    }),

  /** Stop tracking a reference brand (deletes the link, not the brand). */
  untrack: protectedProcedure
    .input(z.object({ inspirationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.query.brandInspirationTable.findFirst({
        where: eq(brandInspirationTable.id, input.inspirationId),
      });
      if (!link) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tracking link not found",
        });
      }
      await assertBrandManageable(ctx, link.brandId);
      await ctx.db
        .delete(brandInspirationTable)
        .where(eq(brandInspirationTable.id, input.inspirationId));
      return { id: input.inspirationId };
    }),

  /**
   * Start capturing a brand's newsletter. Provisions (or reuses) a newsletter
   * `channel` on the brand whose handle is the per-brand inbound address; you
   * subscribe to the competitor's newsletter with that address and forwarded
   * issues land as platform_posts on this brand (see
   * inspiration-newsletter.service.ts). The address token is the brand id, so
   * the binding is created up front — ingest is a deterministic lookup.
   */
  trackNewsletter: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      const address = inspirationAddress(input.brandId);

      const existing = await ctx.db.query.channelTable.findFirst({
        where: and(
          eq(channelTable.brandId, input.brandId),
          eq(channelTable.kind, "newsletter"),
          isNull(channelTable.deletedAt),
        ),
      });
      if (existing) {
        if (existing.handle !== address) {
          await ctx.db
            .update(channelTable)
            .set({ handle: address, isActive: true })
            .where(eq(channelTable.id, existing.id));
        }
        return { channelId: existing.id, address, created: false };
      }

      const [channel] = await ctx.db
        .insert(channelTable)
        .values({
          id: createId("chan"),
          brandId: input.brandId,
          kind: "newsletter",
          platform: "newsletter",
          displayName: "Newsletter",
          handle: address,
          defaultProvider: "email_forward",
        })
        .returning();
      return { channelId: channel!.id, address, created: true };
    }),

  /** Stop capturing a brand's newsletter — soft-delete the channel. Already
   *  ingested issues are kept. */
  untrackNewsletter: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      await ctx.db
        .update(channelTable)
        .set({ deletedAt: new Date(), isActive: false })
        .where(
          and(
            eq(channelTable.brandId, input.brandId),
            eq(channelTable.kind, "newsletter"),
            isNull(channelTable.deletedAt),
          ),
        );
      return { brandId: input.brandId };
    }),

  /**
   * Client connect: the no-login link a Performance customer uses to connect
   * their own accounts into this brand's Zernio profile.
   */
  connectStatus: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .query(async ({ ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.brandId);
      return {
        url: brand.connectToken ? brandConnectUrl(brand.connectToken) : null,
        intakeUrl: brand.connectToken
          ? brandIntakeUrl(brand.connectToken)
          : null,
        channels: await getBrandConnectStatus(input.brandId),
      };
    }),

  createConnectLink: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      const result = await ensureBrandConnect(input.brandId, {
        name: ctx.session.user.name ?? null,
        email: ctx.session.user.email ?? null,
      });
      return { url: result.url };
    }),

  regenerateConnectLink: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      const result = await regenerateBrandConnectToken(input.brandId, {
        name: ctx.session.user.name ?? null,
        email: ctx.session.user.email ?? null,
      });
      return { url: result.url };
    }),

  /**
   * Ad-account allowlist surface: what the brand's ads connections can reach
   * and which accounts an operator has explicitly allowed. Default-deny —
   * nothing is ingested until a human clicks allow here.
   */
  adAccounts: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        /** false = registry only (cheap); true = live Zernio enumeration. */
        discover: z.boolean().default(true),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return listBrandAdAccounts(input.brandId, { discover: input.discover });
    }),

  setAdAccountAllowed: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        platform: z.enum(["facebook", "google"]),
        externalId: z.string().min(1),
        name: z.string().nullable(),
        isAllowed: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return setBrandAdAccountAllowed({
        ...input,
        decidedBy: ctx.session.user.email ?? ctx.session.user.id,
      });
    }),

  /** Pull the brand's recent campaigns through the allowlist, both ad platforms. */
  syncRecentAds: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        sinceDays: z.number().int().min(1).max(1_095).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        minSpend: z.number().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.brandId);
      if (!brand.slug) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only owned brands can sync ads",
        });
      }
      const results = [];
      for (const platform of ["meta_ads", "google_ads"] as const) {
        results.push(
          await syncZernioAds({
            brandSlug: brand.slug,
            platform,
            sinceDays: input.sinceDays ?? undefined,
            limit: input.limit ?? 10,
            minSpend: input.minSpend,
          }),
        );
      }
      return {
        inserted: results.reduce((sum, r) => sum + r.inserted, 0),
        updated: results.reduce((sum, r) => sum + r.updated, 0),
        filteredOut: results.reduce((sum, r) => sum + r.filteredOut, 0),
      };
    }),
});
