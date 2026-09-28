import type { BrandingProfile } from "@mendable/firecrawl-js";
import { z } from "zod";
import { brandMarketsSchema } from "@/lib/markets";
import {
  draftBrandMarkets,
  setBrandMarkets,
} from "@/server/services/brand-markets.service";
import { waitUntil } from "@vercel/functions";
import { and, eq, isNull } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import {
  AD_ACCOUNT_PLATFORMS,
  PUSHABLE_AD_PLATFORMS,
} from "@/lib/ad-platforms";

import { actionProcedure, protectedProcedure } from "@/server/api/orpc";
import {
  addBrandAdPreviewAction,
  enrichBrandAction,
  listBrands,
  setBrandMarkAction,
} from "@/server/ai/capabilities/brands";
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
import { CHECKLIST_FIELD_KIND } from "@/lib/performance-checklist";
import { type db } from "@/server/db";
import {
  addWanderOsHome,
  createManualHomes,
  parseHomeShells,
  removeBrandHome,
  setHomeCarousel,
  setHomeFeatured,
  setHomeHero,
  setHomeMedia,
} from "@/server/services/homes.service";
import { inspirationAddress } from "@/lib/inbound-email";
import {
  draftBrandStory,
  setBrandStory,
} from "@/server/services/brand-story.service";
import { enrichBrandFromWebsite } from "@/server/services/brand-enrichment.service";
import {
  removeBrandAdPreview,
  setBrandPreviewSource,
} from "@/server/services/brand-ad-previews.service";
import {
  BrandFontError,
  googleFontCatalog,
  setBrandFonts,
} from "@/server/services/brand-fonts.service";
import {
  clearBrandMark,
  critiqueBrandMark,
} from "@/server/services/brand-mark.service";
import {
  brandWebsiteState,
  recheckBrandWebsite,
  setBrandWebsiteId,
} from "@/server/services/wanderos-listings.service";
import {
  brandConnectUrl,
  brandIntakeUrl,
  brandPitchUrl,
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

/** The caller's organization. Growth is single-org, so the first is it. */
async function callerOrgId(ctx: Ctx): Promise<string> {
  const [orgId] = await userOrgIds(ctx);
  if (!orgId) {
    throw new ORPCError("FORBIDDEN", {
      message: "No organization for this user",
    });
  }
  return orgId;
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
    throw new ORPCError("NOT_FOUND", { message: "Brand not found" });
  }

  const orgIds = await userOrgIds(ctx);

  if (brand.organizationId) {
    if (!orgIds.includes(brand.organizationId)) {
      throw new ORPCError("FORBIDDEN", { message: "No access to this brand" });
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
    throw new ORPCError("FORBIDDEN", { message: "No access to this brand" });
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

export const brandRouter = {
  listLite: actionProcedure(listBrands),

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
            brandIdentity: z
              .object({
                raw: z
                  .custom<BrandingProfile>(
                    (value) => typeof value === "object" && value !== null,
                  )
                  .optional(),
                colorScheme: z.enum(["light", "dark"]).optional(),
                colors: z
                  .object({
                    primary: z.string().optional(),
                    secondary: z.string().optional(),
                    accent: z.string().optional(),
                  })
                  .optional(),
                fonts: z
                  .array(
                    z.object({
                      family: z.string(),
                      weight: z.number().optional(),
                      role: z.enum(["body", "heading"]).optional(),
                    }),
                  )
                  .optional(),
                logo: z.string().nullish(),
                favicon: z.string().nullish(),
                personality: z
                  .object({
                    tone: z.string(),
                    energy: z.string(),
                    targetAudience: z.string(),
                  })
                  .optional(),
                extractedAt: z.string().optional(),
              })
              .nullish(),
          })
          .nullish(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const website = normalizeWebsite(input.website);
      const shouldEnrich = input.enrich !== false;

      if (input.scope === "owned") {
        const [orgId] = await userOrgIds(ctx);
        if (!orgId) {
          throw new ORPCError("FORBIDDEN", {
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
        throw new ORPCError("BAD_REQUEST", {
          message: "ownerBrandId is required for a tracked brand",
        });
      }
      await assertBrandManageable(ctx, input.ownerBrandId);
      const profileUrl = normalizeProfileUrl(input.profile?.url);
      if (input.profile && !profileUrl) {
        throw new ORPCError("BAD_REQUEST", {
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
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
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
    .handler(async ({ context: ctx, input }) => {
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

  /**
   * Set fields on the hand-kept performance checklist. Each changed field is
   * stamped with who set it and when (server-side, from the session), like a
   * comment. A null or empty value clears the field and its stamp.
   */
  setPerformanceChecklist: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        patch: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.null()]),
        ),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.id);
      const brand = await ctx.db.query.brandTable.findFirst({
        where: eq(brandTable.id, input.id),
        columns: { performanceChecklist: true },
      });
      const current = brand?.performanceChecklist ?? {};
      const values = { ...(current.values ?? {}) };
      const meta = { ...(current.meta ?? {}) };
      const now = new Date().toISOString();
      const by = ctx.session.user.id;
      const byName = ctx.session.user.name ?? null;
      for (const [key, value] of Object.entries(input.patch)) {
        if (!CHECKLIST_FIELD_KIND[key]) continue; // ignore unknown keys
        if (value === null || value === "") {
          delete values[key];
          delete meta[key];
        } else {
          values[key] = value;
          meta[key] = { by, byName, at: now };
        }
      }
      const [updated] = await ctx.db
        .update(brandTable)
        .set({ performanceChecklist: { values, meta } })
        .where(eq(brandTable.id, input.id))
        .returning({
          performanceChecklist: brandTable.performanceChecklist,
        });
      return updated?.performanceChecklist ?? { values, meta };
    }),

  setMark: actionProcedure(setBrandMarkAction),

  /** "Fix with AI": the art director's corrections for the lockup as edited. */
  critiqueMark: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        iconAssetId: z.string().nullish(),
        iconFrom: z.enum(["logo", "favicon", "logo-icon"]).nullish(),
        text: z.string().trim().max(60).nullish(),
        fontFamily: z.string().trim().max(80).nullish(),
        fontWeight: z
          .union([
            z.literal(400),
            z.literal(500),
            z.literal(600),
            z.literal(700),
          ])
          .nullish(),
        letterSpacing: z.number().min(-0.05).max(0.3).nullish(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.id);
      return critiqueBrandMark({
        brandId: input.id,
        recipe: {
          source: "lockup",
          iconAssetId: input.iconAssetId ?? null,
          iconFrom: input.iconFrom ?? null,
          text: input.text ?? null,
          fontFamily: input.fontFamily,
          fontWeight: input.fontWeight ?? null,
          letterSpacing: input.letterSpacing ?? null,
        },
      });
    }),

  /** Every Google Fonts family, most popular first, for the font picker. */
  fontCatalog: protectedProcedure.handler(() => googleFontCatalog()),

  /**
   * Pick the heading and body fonts the brand's cards are set in. Both null
   * goes back to the fonts read off the site.
   */
  setFonts: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        heading: z.string().trim().min(1).max(80).nullable(),
        body: z.string().trim().min(1).max(80).nullable(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.id);
      try {
        return await setBrandFonts({
          brandId: input.id,
          userId: ctx.session.user.id,
          heading: input.heading,
          body: input.body,
        });
      } catch (error) {
        if (error instanceof BrandFontError) {
          throw new ORPCError("BAD_REQUEST", { message: error.message });
        }
        throw error;
      }
    }),

  clearMark: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.id);
      await clearBrandMark(input.id);
      return { id: input.id };
    }),

  addAdPreview: actionProcedure(addBrandAdPreviewAction),

  removeAdPreview: protectedProcedure
    .input(z.object({ id: z.string(), assetId: z.string().min(1) }))
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.id);
      const previews = await removeBrandAdPreview({
        brandId: input.id,
        assetId: input.assetId,
      });
      return { id: input.id, count: previews.length };
    }),

  /**
   * What the on-demand ad previews are drawn from. A home passes its listing
   * and hero URL; a library image passes its URL alone; nulls clear.
   */
  setPreviewSource: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        listingUrl: z.string().url().nullable().optional(),
        sourceUrl: z.string().url().nullable(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.id);
      return setBrandPreviewSource({
        brandId: input.id,
        listingUrl: input.listingUrl,
        sourceUrl: input.sourceUrl,
      });
    }),

  /**
   * Which of a home's photos the ads draw on. The home is guarded by its own
   * brand's organization, so a home id is enough. Null clears the pick back
   * to the first photo on their feed.
   */
  /** Setup: save the brand story as the operator edited it. */
  setStory: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        story: z.string().max(4000).nullable(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.brandId);
      return setBrandStory({ brandId: brand.id, story: input.story });
    }),

  /** Setup: draft the brand story from the site, the homes and the guests. */
  draftStory: protectedProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .handler(async ({ context: ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.brandId);
      return draftBrandStory({ brandId: brand.id });
    }),

  /** Setup: draft the brand's markets from its homes' towns and listings. */
  draftMarkets: protectedProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .handler(async ({ context: ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.brandId);
      return draftBrandMarkets({ brandId: brand.id });
    }),

  /** Setup: save the markets as the operator edited or confirmed them. */
  setMarkets: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        markets: brandMarketsSchema.shape.markets,
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.brandId);
      return setBrandMarkets({
        brandId: brand.id,
        userId: ctx.session.user.id,
        markets: input.markets,
      });
    }),

  /** Setup: tick a home into the featured set, or out of it. */
  homesSetFeatured: protectedProcedure
    .input(z.object({ homeId: z.string().min(1), featured: z.boolean() }))
    .handler(async ({ context: ctx, input }) => {
      const orgId = await callerOrgId(ctx);
      return setHomeFeatured({ ...input, orgId });
    }),

  setHomeHero: protectedProcedure
    .input(
      z.object({
        homeId: z.string().min(1),
        sourceUrl: z.string().url().nullable(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const orgId = await callerOrgId(ctx);
      return setHomeHero({
        homeId: input.homeId,
        orgId,
        sourceUrl: input.sourceUrl,
      });
    }),

  /**
   * A decision about one of a home's photos: where it sits in the gallery, or
   * that it is out of it. Feed photos get their first row here.
   */
  setHomeMedia: protectedProcedure
    .input(
      z.object({
        homeId: z.string().min(1),
        assetId: z.string().min(1).nullish(),
        sourceUrl: z.string().url().nullish(),
        thumbUrl: z.string().url().nullish(),
        role: z.enum(["gallery", "excluded", "carousel"]).optional(),
        sortOrder: z.number().int().min(0).nullish(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const orgId = await callerOrgId(ctx);
      return setHomeMedia({
        ...input,
        orgId,
        addedBy: ctx.session.user.id,
      });
    }),

  /**
   * The home's carousel, replaced in the order given. One call for the whole
   * sequence: reordering is a single decision, and a write per nudge invites
   * half-saved orders.
   */
  setHomeCarousel: protectedProcedure
    .input(
      z.object({
        homeId: z.string().min(1),
        photos: z
          .array(
            z.object({
              assetId: z.string().min(1).nullish(),
              sourceUrl: z.string().url().nullish(),
              thumbUrl: z.string().url().nullish(),
            }),
          )
          .max(10),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const orgId = await callerOrgId(ctx);
      return setHomeCarousel({
        homeId: input.homeId,
        orgId,
        photos: input.photos,
        addedBy: ctx.session.user.id,
      });
    }),

  enrich: actionProcedure(enrichBrandAction),

  /**
   * Scrape a website WITHOUT saving anything — the dialog's Enrich button.
   * The values come back to the client for preview and ride up again on
   * brand.create.
   */
  previewEnrichment: protectedProcedure
    .input(z.object({ website: z.string().trim().min(3).max(2000) }))
    .handler(async ({ input }) => {
      const website = normalizeWebsite(input.website);
      if (!website) {
        throw new ORPCError("BAD_REQUEST", { message: "Enter a URL" });
      }
      const enrichment = await enrichBrandFromWebsite(website);
      if (!enrichment) {
        throw new ORPCError("BAD_REQUEST", {
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
        brandIdentity: enrichment.brandIdentity ?? null,
      };
    }),

  /** Soft-delete an owned brand. Use `untrack` for reference brands. */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.id);
      if (!brand.organizationId) {
        throw new ORPCError("BAD_REQUEST", {
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
    .handler(async ({ context: ctx, input }) => {
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
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return purgeBrand(input);
    }),

  /** Stop tracking a reference brand (deletes the link, not the brand). */
  untrack: protectedProcedure
    .input(z.object({ inspirationId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const link = await ctx.db.query.brandInspirationTable.findFirst({
        where: eq(brandInspirationTable.id, input.inspirationId),
      });
      if (!link) {
        throw new ORPCError("NOT_FOUND", {
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
    .handler(async ({ context: ctx, input }) => {
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
    .handler(async ({ context: ctx, input }) => {
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
  /**
   * Whether this brand's site is one we built, and the id that proves it.
   *
   * Discovery reads their homepage, so it happens once and the answer sticks
   * until someone asks again here.
   */
  websiteState: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return brandWebsiteState(input.brandId);
    }),

  recheckWebsite: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return recheckBrandWebsite(input.brandId);
    }),

  setWebsiteId: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        websiteId: z.string().trim().max(40).nullable(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return setBrandWebsiteId(input);
    }),

  connectStatus: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.brandId);
      return {
        url: brand.connectToken ? brandConnectUrl(brand.connectToken) : null,
        // Slug reads better in a link a rep sends, and resolves the same.
        intakeUrl: brand.slug
          ? brandIntakeUrl(brand.slug)
          : brand.connectToken
            ? brandIntakeUrl(brand.connectToken)
            : null,
        // Slug only: the pitch goes out before anything is signed and gets
        // read out loud, and the page shows nothing a token would protect.
        pitchUrl: brand.slug ? brandPitchUrl(brand.slug) : null,
        channels: await getBrandConnectStatus(input.brandId),
      };
    }),

  createConnectLink: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      const result = await ensureBrandConnect(input.brandId, {
        name: ctx.session.user.name ?? null,
        email: ctx.session.user.email ?? null,
      });
      return { url: result.url };
    }),

  regenerateConnectLink: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .handler(async ({ context: ctx, input }) => {
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
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return listBrandAdAccounts(input.brandId, { discover: input.discover });
    }),

  setAdAccountAllowed: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        platform: z.enum(AD_ACCOUNT_PLATFORMS),
        externalId: z.string().min(1),
        name: z.string().nullable(),
        isAllowed: z.boolean(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      await assertBrandManageable(ctx, input.brandId);
      return setBrandAdAccountAllowed({
        ...input,
        decidedBy: ctx.session.user.email ?? ctx.session.user.id,
      });
    }),

  /** Pull the brand's recent campaigns through the allowlist, every pushable platform. */
  syncRecentAds: protectedProcedure
    .input(
      z.object({
        brandId: z.string(),
        sinceDays: z.number().int().min(1).max(1_095).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        minSpend: z.number().min(0).optional(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.brandId);
      if (!brand.slug) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Only owned brands can sync ads",
        });
      }
      const results = [];
      for (const platform of PUSHABLE_AD_PLATFORMS) {
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

  /**
   * Setup: commit one of the client's WanderOS listings as a home. Singular by
   * design — a person picks a tile at a time, and an agent composes one pick
   * per home. The feed is re-read server-side, so an id off a stale tab cannot
   * write a listing that is not theirs.
   */
  homesAddWanderOs: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        externalId: z.string().min(1),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.brandId);
      const home = await addWanderOsHome({
        brandId: brand.id,
        website: brand.website,
        externalId: input.externalId,
      });
      return { homeId: home.id, name: home.name };
    }),

  /**
   * Setup: create home shells for a brand with no feed we can read. The agent
   * pulls homes out of whatever the operator pastes; only stated facts land.
   */
  homesShellsFromText: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        text: z.string().trim().min(1).max(20_000),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.brandId);
      const shells = await parseHomeShells(input.text);
      if (shells.length === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "No homes found in that text.",
        });
      }
      const rows = await createManualHomes({
        brandId: brand.id,
        homes: shells,
      });
      return { added: rows.length, homes: rows.map((row) => row.name) };
    }),

  /** Setup: drop a committed home. The feed still carries it; this un-picks it. */
  homesRemove: protectedProcedure
    .input(z.object({ brandId: z.string().min(1), homeId: z.string().min(1) }))
    .handler(async ({ context: ctx, input }) => {
      const brand = await assertBrandManageable(ctx, input.brandId);
      return removeBrandHome({ brandId: brand.id, homeId: input.homeId });
    }),
};
