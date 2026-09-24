import {
  listBrandsOutputSchema,
  createBrandActionOutputSchema,
  addBrandAdPreviewActionOutputSchema,
  setPerformanceSettingsActionOutputSchema,
  enrichBrandActionOutputSchema,
} from "./outputs/brands";
import "server-only";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";
import {
  createOwnedBrand,
  enrichBrandById,
} from "@/server/services/brand-ops.service";
import {
  createProspectFromLead,
  setBrandRelationship,
} from "@/server/services/brand-relationship.service";
import {
  critiqueBrandMark,
  setBrandMark,
} from "@/server/services/brand-mark.service";
import {
  addBrandAdPreview,
  performanceBrandPath,
  setBrandPreviewSource,
} from "@/server/services/brand-ad-previews.service";
import {
  performanceSettingsPatchSchema,
  setPerformanceSettings,
} from "@/server/services/performance-settings.service";
import {
  draftBrandStory,
  setBrandStory,
} from "@/server/services/brand-story.service";
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
  outputSchema: listBrandsOutputSchema,
  description:
    "List the brands in the current organization (id, name, tagline, and Wander's relationship to each: internal, client, prospect or reference). Use when the operator asks about brands or you need a brand's name/id.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const brands = await db.query.brandTable.findMany({
      where: and(
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, name: true, tagline: true, relationship: true },
      orderBy: (t, { asc }) => asc(t.name),
    });
    return { brands };
  },
});

export const createBrandAction = growthAction({
  outputSchema: createBrandActionOutputSchema,
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

export const addBrandAdPreviewAction = growthAction({
  outputSchema: addBrandAdPreviewActionOutputSchema,
  description:
    "Keep a frozen card as one of the brand's ad previews: what their ads will look like, shown inside feed mocks on the Performance brand page before any campaign exists. mediaAssetId is a card from contentMediaWrite.freezeComposition; homeUrl is the listing it shows when known. Saving the same card again moves it to the front. Read the brand-ad-preview playbook for the whole job.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    mediaAssetId: z.string().min(1),
    homeUrl: z.string().url().nullish(),
  }),
  execute: async (input, ctx) => {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, slug: true },
    });
    if (!brand) {
      throw new Error(
        "That brand is not available in the active organization.",
      );
    }
    const previews = await addBrandAdPreview({
      brandId: brand.id,
      assetId: input.mediaAssetId,
      userId: ctx.userId,
      homeUrl: input.homeUrl ?? null,
    });
    return {
      ok: true as const,
      brandId: brand.id,
      count: previews.length,
      path: performanceBrandPath(brand),
    };
  },
});

/**
 * The general brand writer. It carries the hero today and is where further
 * plain brand fields belong, rather than a tool per field.
 */
export const updateBrandAction = growthAction({
  description:
    "Update an owned brand's fields. Send only the keys to change. story is the brand story: the short brief every creative prompt for this brand reads (what makes it itself, who books, voice, what to avoid); send the whole new text, keeping everything still true, and keep it brief. heroHomeId sets the brand's hero, the one home that stands for the brand in its previews; null clears it. heroImageUrl picks which photo the previews draw: one of the hero home's photos, or a library image; without it the hero home's own hero photo is used. Nothing is chosen on the brand's behalf, so a brand with no hero shows none until one is set.",
  inputSchema: z
    .object({
      brandId: z.string().min(1),
      heroHomeId: z.string().min(1).nullable().optional(),
      heroImageUrl: z.string().url().nullable().optional(),
      story: z.string().max(4000).nullable().optional(),
    })
    .refine(
      (value) =>
        value.heroHomeId !== undefined ||
        value.heroImageUrl !== undefined ||
        value.story !== undefined,
      { message: "Send at least one field to change." },
    ),
  outputSchema: z.object({
    brandId: z.string(),
    heroListingUrl: z.string().nullable(),
    heroImageUrl: z.string().nullable(),
    story: z.string().nullable(),
  }),
  examples: [{ brandId: "brand_winterpark", heroHomeId: "home_01" }],
  execute: async (input, ctx) => {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: {
        id: true,
        featuredListingUrl: true,
        previewSourceUrl: true,
        story: true,
      },
    });
    if (!brand)
      throw new Error(
        "That brand is not available in the active organization.",
      );
    let listingUrl = brand.featuredListingUrl;
    let sourceUrl =
      input.heroImageUrl !== undefined
        ? input.heroImageUrl
        : brand.previewSourceUrl;
    if (input.heroHomeId === null) {
      listingUrl = null;
      sourceUrl = input.heroImageUrl ?? null;
    } else if (input.heroHomeId !== undefined) {
      const home = await db.query.homeTable.findFirst({
        where: and(
          eq(homeTable.id, input.heroHomeId),
          eq(homeTable.brandId, brand.id),
          isNull(homeTable.deletedAt),
        ),
        columns: { url: true, heroSourceUrl: true },
      });
      if (!home) throw new Error("That home is not on this brand's record.");
      listingUrl = home.url;
      sourceUrl = input.heroImageUrl ?? home.heroSourceUrl;
    }
    if (input.heroHomeId !== undefined || input.heroImageUrl !== undefined)
      await setBrandPreviewSource({ brandId: brand.id, listingUrl, sourceUrl });
    const story =
      input.story !== undefined
        ? (await setBrandStory({ brandId: brand.id, story: input.story })).story
        : brand.story;
    return {
      brandId: brand.id,
      heroListingUrl: listingUrl,
      heroImageUrl: sourceUrl,
      story,
    };
  },
});

export const draftBrandStoryAction = growthAction({
  description:
    "Draft the brand story from what the brand already shows (its site identity, its homes, and a few things guests said) and save it. Use it once at setup, or when the operator asks to start the story over; to add to an existing story, use brandWrite.update with story instead.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: z.object({ story: z.string().nullable() }),
  examples: [{ brandId: "brand_winterpark" }],
  execute: async (input, ctx) => {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true },
    });
    if (!brand)
      throw new Error(
        "That brand is not available in the active organization.",
      );
    return draftBrandStory({ brandId: brand.id });
  },
});

export const setPerformanceSettingsAction = growthAction({
  outputSchema: setPerformanceSettingsActionOutputSchema,
  description:
    "Set a Performance client's live settings on the brand: report emails, invoice email, UGC permission, the client's creative and guest-list folders, the catalog / carousel / hero creative folders, the ad copies doc, dedicated newsletter, influencer, social posts, and hand-counted bookings. Send only the keys to change; an empty string clears one. This is the only writer besides an applied intake, which fills empty cells and never overwrites, so replacing a value the client gave is your decision to make and to say.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    patch: performanceSettingsPatchSchema,
  }),
  execute: async (input, ctx) => {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, slug: true },
    });
    if (!brand) {
      throw new Error(
        "That brand is not available in the active organization.",
      );
    }
    const result = await setPerformanceSettings({
      brandId: brand.id,
      orgId: ctx.orgId,
      patch: input.patch,
      by: ctx.userId,
      from: "agent",
    });
    return {
      ok: true as const,
      brandId: brand.id,
      changed: result.changed,
      settings: result.settings,
      path: `${performanceBrandPath(brand)}/settings`,
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
  outputSchema: enrichBrandActionOutputSchema,
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
      evidence: result.evidence,
      applied: result.applied,
      brandId: result.brand.id,
      name: result.brand.name,
      tagline: result.brand.tagline,
      description: result.brand.description,
      logo: result.brand.logo,
    };
  },
});

export const setBrandMarkAction = growthAction({
  description:
    "Set the brand mark drawn on every composition and card: three tones (colour, white, dark) rendered into the brand's library. source logo uses the scraped logo, favicon the site icon, lockup an icon beside the brand name in its heading font. A lockup is judged by the art director and its corrections applied before saving, the same as the Fix with AI button. Run brandWrite.enrich first so there is a logo to draw. Re-running replaces the mark.",
  inputSchema: z.object({
    brandId: z.string().trim().min(1),
    source: z.enum(["logo", "favicon", "lockup"]).default("logo"),
    text: z
      .string()
      .trim()
      .max(60)
      .nullish()
      .describe("Lockup only: the wordmark text. Defaults to the brand name."),
    iconFrom: z
      .enum(["logo", "favicon"])
      .nullish()
      .describe(
        "Lockup only: which scraped image is the icon. Default logo; null for a wordmark with no icon.",
      ),
    iconAssetId: z
      .string()
      .nullish()
      .describe(
        "Lockup only: a library image to use as the icon instead of iconFrom.",
      ),
    fontFamily: z
      .string()
      .trim()
      .max(80)
      .nullish()
      .describe(
        "Lockup only: the wordmark font. Omit for the brand's heading font; null for the house font.",
      ),
    tuning: z
      .object({
        iconScale: z.number().min(0.7).max(1.4),
        iconShift: z.number().min(-0.3).max(0.3),
        gapScale: z.number().min(0.6).max(1.6),
        note: z.string().max(600),
      })
      .nullish()
      .describe(
        "Lockup only: art director corrections to keep as given; null saves the lockup as measured. Omit to have it judged before saving.",
      ),
  }),
  outputSchema: z.object({
    brandId: z.string(),
    source: z.enum(["logo", "favicon", "lockup"]),
    variants: z.object({
      color: z.string(),
      white: z.string(),
      dark: z.string(),
    }),
    note: z.string().nullable(),
    path: z.string(),
  }),
  examples: [
    { brandId: "brand_winterpark" },
    { brandId: "brand_winterpark", source: "lockup", iconFrom: "favicon" },
  ],
  execute: async (input, ctx) => {
    const brand = await assertOwnedBrand(input.brandId, ctx.orgId);
    const lockup = input.source === "lockup";
    const iconAssetId = lockup ? (input.iconAssetId ?? null) : null;
    const recipe = {
      source: input.source,
      iconAssetId,
      iconFrom:
        !lockup || iconAssetId
          ? null
          : input.iconFrom === undefined
            ? ("logo" as const)
            : input.iconFrom,
      text: input.text ?? null,
      fontFamily: lockup ? input.fontFamily : undefined,
    };
    // A lockup is measured, then looked at: the same vision pass the editor's
    // Fix with AI runs, applied before the tones are rendered. Corrections the
    // caller already accepted are kept as given.
    const tuning =
      input.tuning !== undefined
        ? input.tuning
        : lockup
          ? await critiqueBrandMark({ brandId: brand.id, recipe }).catch(
              (error: unknown) => {
                console.error(
                  "lockup critique failed, saving as measured",
                  error,
                );
                return null;
              },
            )
          : null;
    const mark = await setBrandMark({
      brandId: brand.id,
      userId: ctx.userId,
      recipe,
      tuning,
    });
    return {
      brandId: brand.id,
      source: mark.source,
      variants: mark.variants,
      note: tuning?.note ?? null,
      path: `/app/brands/${brand.slug ?? brand.id}`,
    };
  },
});

/** Require membership in the brand organization before targeted changes. */
async function assertOwnedBrand(brandId: string, orgId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
    ),
    columns: { id: true, name: true, slug: true },
  });
  if (!brand) throw new Error("Brand not found in this organization.");
  return brand;
}
