import { readPaymentSettings } from "@/server/services/performance-payment-state";
import { steerSchema } from "@/lib/generation-steer";
import { creativeDirectionSchema } from "@/lib/brand-direction";
import type { BrandListResult, GetBrandOutput } from "./outputs/brands";
import {
  listBrandsOutputSchema,
  getBrandOutputSchema,
  createBrandActionOutputSchema,
  addBrandAdPreviewActionOutputSchema,
  setPerformanceSettingsActionOutputSchema,
  enrichBrandActionOutputSchema,
} from "./outputs/brands";
import "server-only";

import { z } from "zod";
import {
  brandMarkInspectionSchema,
  readSavedBrandMarkInspection,
} from "@/server/services/brand-mark-inspection.service";
import { brandPreviewCopySchema } from "@/lib/brand-preview-copy";
import { and, eq, isNull, ilike, or } from "drizzle-orm";

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
  recommendBrandMark,
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
    "Find brands by name, slug, or website using query. Use this when a brand's id is unknown; use brandRead.get directly when the focused brand id is already known. Omit query only when the operator needs an organization-wide brand inventory. Returns id, name, slug, tagline, logo and relationship.",
  inputSchema: z.object({
    query: z.string().trim().min(1).max(200).optional(),
  }),
  execute: async (input, ctx): Promise<BrandListResult> => {
    // Search literal text; operator input is not an SQL wildcard expression.
    const pattern = input.query
      ? `%${input.query.replace(/[\\%_]/g, "\\$&")}%`
      : undefined;
    const brands = await db.query.brandTable.findMany({
      where: and(
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
        pattern
          ? or(
              ilike(brandTable.name, pattern),
              ilike(brandTable.slug, pattern),
              ilike(brandTable.website, pattern),
            )
          : undefined,
      ),
      columns: {
        id: true,
        name: true,
        slug: true,
        tagline: true,
        relationship: true,
        logo: true,
      },
      orderBy: (t, { asc }) => asc(t.name),
    });
    return { brands };
  },
});

export const getBrand = growthAction({
  outputSchema: getBrandOutputSchema,
  description:
    "Read one brand by its known id, especially the focused brand. Returns current website, identity summary, story, and Performance settings including recorded journey, card statuses and note. Read before targeted edits and again to verify them. No organization-wide list is needed when the brand id is known. Missing recorded facts do not imply unpaid or unstarted work.",
  inputSchema: z.object({ brandId: z.string().trim().min(1) }),
  execute: async (input, ctx): Promise<GetBrandOutput> => {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, ctx.orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: {
        id: true,
        name: true,
        slug: true,
        relationship: true,
        tagline: true,
        website: true,
        logo: true,
        description: true,
        story: true,
        creativeDirection: true,
        websiteMeta: true,
        brandIdentity: true,
        performanceSettings: true,
      },
    });
    if (!brand)
      throw new Error(
        "That brand is not available in the active organization.",
      );
    const { websiteMeta, brandIdentity, ...fields } = brand;
    return {
      brand: {
        ...fields,
        performanceSettings: await readPaymentSettings(
          brand.id,
          brand.performanceSettings,
        ),
        enrichment: {
          scrapedAt: websiteMeta?.scrapedAt ?? null,
          hasBrandIdentity: Boolean(brandIdentity),
        },
      },
    };
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
    "Update an owned brand's fields. Send only the keys to change. story is the brief every creative prompt reads: distinguishing features, guests, voice and what to avoid. heroImageUrl sets the general brand preview image from website, library or home photos; null restores the website image. Choosing an image does not choose a representative home or import property facts. heroHomeId is retained for compatibility with older home-photo selections; prefer heroImageUrl for new changes.",
  inputSchema: z
    .object({
      brandId: z.string().min(1),
      heroHomeId: z.string().min(1).nullable().optional(),
      heroImageUrl: z.string().url().nullable().optional(),
      story: z.string().max(4000).nullable().optional(),
      creativeDirection: creativeDirectionSchema.nullable().optional(),
    })
    .refine(
      (value) =>
        value.heroHomeId !== undefined ||
        value.heroImageUrl !== undefined ||
        value.story !== undefined ||
        value.creativeDirection !== undefined,
      { message: "Send at least one field to change." },
    ),
  outputSchema: z.object({
    brandId: z.string(),
    heroListingUrl: z.string().nullable(),
    heroImageUrl: z.string().nullable(),
    story: z.string().nullable(),
  }),
  examples: [
    {
      brandId: "brand_winterpark",
      heroImageUrl: "https://example.com/brand-preview.jpg",
    },
  ],
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
        creativeDirection: true,
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
    if (input.heroImageUrl !== undefined && input.heroHomeId === undefined)
      listingUrl = null;
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
      input.story !== undefined || input.creativeDirection !== undefined
        ? (
            await setBrandStory({
              brandId: brand.id,
              story: input.story,
              creativeDirection: input.creativeDirection,
            })
          ).story
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
    "Draft the brand story from what the brand already shows (its site identity, its homes, and a few things guests said) and save it. Generates story and structured creative direction together. Read brandRead.context first and pass steer for the requested changes; current accepted direction is preserved unless changed. For precise edits use brandWrite.update.",
  inputSchema: z.object({ brandId: z.string().min(1), steer: steerSchema }),
  outputSchema: z.object({
    story: z.string().nullable(),
    creativeDirection: creativeDirectionSchema,
  }),
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
    return draftBrandStory({ brandId: brand.id, steer: input.steer });
  },
});

export const setPerformanceSettingsAction = growthAction({
  outputSchema: setPerformanceSettingsActionOutputSchema,
  description:
    "Edit a client's manually maintained Performance settings and monthly billing spreadsheet. Save requested edits directly, including overwriting existing values, without payment verification or a confirmation step. monthlyFee and agreedAdSpend are recurring USD amounts shown on cards. For a specific month use patch.billing: period (YYYY-MM), managementFee, adSpend, managementPayment and spendPayment (Paid, Open for unpaid, or Not invoiced). Historical and future months are editable. Omitted fields stay unchanged; null clears a value, zero is valid. A billing save returns the actual saved monthly row; confirm those values. Paying a month never moves a journey stage or changes campaigns, delivery, or recurring amounts. cardState payment fields are compatibility inputs: include billingPeriod for the requested month; otherwise they edit the current month. pipelineStage is independently selected: prospects, signed, onboarding, launch_prep (Creative), delivery, first_month, live (Ongoing), paused (On hold). Other cardState fields record creative and platform statuses independently. Partial patches preserve unrelated fields. Set note for a current handoff note, up to 2000 characters; null or empty string clears it. Contract dates are YYYY-MM-DD. Other settings include report/invoice emails, terms, UGC permission, creative and guest-list folders, newsletter, influencer, social posts, bookings and siteLive. Billing is user input, with no connection to payment providers or campaign activity.",
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
      billing: result.billing,
      settings: result.settings,
      path: `${performanceBrandPath(brand)}/${result.billing ? "billing" : "settings"}`,
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
    "Scrape a brand's website (Firecrawl) and write the logo, tagline, description, and page metadata onto the brand. Also probe and save WanderOS detection without importing homes. Idempotent — re-running refreshes the same fields. Pass website to set or override the brand's URL in the same step.",
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
    "Set the brand mark drawn on every composition and card: three tones (colour, white, dark) rendered into the brand's library. source logo uses the scraped logo, favicon the site icon, lockup an icon beside the brand name in its heading font. iconFrom logo-icon cuts the icon out of the logo (the leading glyph, or the top row of a stacked logo such as a monogram over the name) and sets it at exactly the wordmark's cap height; the usual fix for a stacked logo that goes illegible at card size. A lockup is judged by the art director and its corrections applied before saving, the same as the Fix with AI button. Run brandWrite.enrich first so there is a logo to draw. Re-running replaces the mark.",
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
      .enum(["logo", "favicon", "logo-icon"])
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
    fontWeight: z
      .union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)])
      .nullish()
      .describe(
        "Lockup only: the wordmark weight. Default 700. Match the brand's own wordmark: 400 for a light, high-contrast serif.",
      ),
    letterSpacing: z
      .number()
      .min(-0.05)
      .max(0.3)
      .nullish()
      .describe(
        "Lockup only: tracking in em. Default -0.02. Spaced capitals like a luxury wordmark sit around 0.12 to 0.18.",
      ),
    reason: z
      .string()
      .trim()
      .max(4000)
      .optional()
      .describe("Accepted recommendation reason, when applying recommendMark."),
    previewCopy: brandPreviewCopySchema
      .nullish()
      .describe(
        "Short sample-creative headline, supporting line and CTA. Omit to keep existing copy.",
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
    imageTreatment: z.object({ lightBackgroundRemoved: z.boolean() }),
    visualInspection: z.literal("required"),
    note: z
      .string()
      .nullable()
      .describe(
        "Optical critique before saving; confirm its claims with brandRead.identity and inspect true.",
      ),
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
      fontWeight: lockup ? (input.fontWeight ?? null) : null,
      letterSpacing: lockup ? (input.letterSpacing ?? null) : null,
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
      previewCopy: input.previewCopy,
      reason: input.reason,
    });
    return {
      brandId: brand.id,
      source: mark.source,
      variants: mark.variants,
      imageTreatment: mark.imageTreatment,
      visualInspection: "required" as const,
      note: tuning?.note ?? null,
      path: `/app/brands/${brand.slug ?? brand.id}`,
    };
  },
});

const markRecipeSchema = z.object({
  source: z.enum(["logo", "favicon", "lockup"]),
  iconAssetId: z.string().nullish(),
  iconFrom: z.enum(["logo", "favicon", "logo-icon"]).nullish(),
  text: z.string().nullish(),
  fontFamily: z.string().nullish(),
  fontWeight: z
    .union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)])
    .nullish(),
  letterSpacing: z.number().nullish(),
});
const markTuningSchema = z.object({
  iconScale: z.number(),
  iconShift: z.number(),
  gapScale: z.number(),
  note: z.string(),
});

const savedMarkSchema = markRecipeSchema.extend({
  previewCopy: brandPreviewCopySchema.nullish(),
  variants: z.object({
    color: z.string(),
    white: z.string(),
    dark: z.string(),
  }),
  tuning: markTuningSchema.nullish(),
  reason: z.string().nullish(),
});

export const readBrandIdentityAction = growthAction({
  description:
    "Read the brand's visual identity and current creative mark before discussing changes. Returns website logo, favicon, colors, fonts, current mark recipe and saved variant asset IDs. Set inspect true to include saved image references; in Shape chat these are delivered as color, white, dark and on-photo pixels. Does not change anything. Identity refresh uses brandWrite.enrich; mark changes use brandWrite.setMark after agreeing the direction.",
  inputSchema: z.object({
    brandId: z.string().trim().min(1),
    inspect: z
      .boolean()
      .optional()
      .describe(
        "Include saved mark images for visual verification. Use after setMark.",
      ),
  }),
  outputSchema: z.object({
    brandId: z.string(),
    logo: z.string().nullable(),
    favicon: z.string().nullable(),
    colors: z.record(z.string(), z.string()),
    fonts: z.array(
      z.object({
        family: z.string(),
        role: z.enum(["body", "heading"]).optional(),
      }),
    ),
    mark: savedMarkSchema.nullable(),
    logoOnCreatives: z.boolean(),
    inspection: brandMarkInspectionSchema.optional(),
  }),
  execute: async (input, ctx) => {
    await assertOwnedBrand(input.brandId, ctx.orgId);
    const brand = await db.query.brandTable.findFirst({
      where: eq(brandTable.id, input.brandId),
      columns: {
        logo: true,
        brandIdentity: true,
        websiteMeta: true,
        brandMark: true,
        performanceSettings: true,
      },
    });
    if (!brand) throw new Error("Brand not found");
    return {
      brandId: input.brandId,
      ...(input.inspect && brand.brandMark
        ? {
            inspection: await readSavedBrandMarkInspection({
              brandId: input.brandId,
              userId: ctx.userId,
              orgId: ctx.orgId,
            }),
          }
        : {}),
      logo: brand.brandIdentity?.logo ?? brand.logo,
      favicon:
        brand.brandIdentity?.favicon ?? brand.websiteMeta?.favicon ?? null,
      colors: brand.brandIdentity?.colors ?? {},
      fonts: (brand.brandIdentity?.fonts ?? []).map(({ family, role }) => ({
        family,
        ...(role ? { role } : {}),
      })),
      mark: brand.brandMark ? savedMarkSchema.parse(brand.brandMark) : null,
      logoOnCreatives: brand.performanceSettings?.logoOnCreatives !== false,
    };
  },
});

export const recommendBrandMarkAction = growthAction({
  description:
    "Explore a creative mark without saving it. Renders candidates and recommends one, optionally following the operator's direction. Returns its recipe, optical tuning and alternatives. Discuss these first; only call brandWrite.setMark with the accepted recipe and tuning when asked to apply. For in-app previews, use /api/brands/mark-preview with brandId, source, tone and recipe query fields; this requires the signed-in browser session.",
  inputSchema: z.object({
    brandId: z.string().trim().min(1),
    direction: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .describe("Legacy alias for steer; use steer for new calls."),
    steer: steerSchema,
  }),
  outputSchema: z.object({
    brandId: z.string(),
    recipe: markRecipeSchema,
    tuning: markTuningSchema.nullable(),
    reason: z.string(),
    alternatives: z.array(markRecipeSchema),
    previewCopy: brandPreviewCopySchema,
  }),
  execute: async (input, ctx) => {
    await assertOwnedBrand(input.brandId, ctx.orgId);
    const recommendation = await recommendBrandMark({
      ...input,
      direction: input.steer ?? input.direction,
    });
    if (!recommendation)
      throw new Error("No logo, favicon or name to build a mark from.");
    return { brandId: input.brandId, ...recommendation };
  },
});

/** Require membership in the brand organization before targeted changes. */
async function assertOwnedBrand(brandId: string, orgId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true },
  });
  if (!brand) throw new Error("Brand not found in this organization.");
  return brand;
}
