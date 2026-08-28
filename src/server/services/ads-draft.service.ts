import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  adSetTable,
  adSpotTable,
  brandTable,
  platformCampaignTable,
  campaignTable,
  type MediaItem,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";

// ---- FIRST-PARTY AD DRAFTS --------------------------------------------
//
// The thing you author is an INITIATIVE: one push, brand-scoped, carrying its
// ad sets (targeting + budget) and ads (creative + copy). Per-platform
// `campaign` rows are created by the push, from the platform's own response —
// which is why `campaign` gets to keep meaning "a real campaign on a real ad
// account" and why a draft never needs a placeholder channel to exist.
//
// It is the same canonical/per-surface split the organic side already uses
// (content_post → platform_post); `initiative` is literally the shared layer,
// referenced by content_post and series as well as campaign.

export type DraftAdPlatform = "meta_ads" | "google_ads";

async function requireOwnedBrand(input: {
  organizationId: string;
  brandId?: string;
  brandSlug?: string;
}) {
  if (!input.brandId && !input.brandSlug) {
    throw new Error("brandId or brandSlug is required");
  }
  const brand = await db.query.brandTable.findFirst({
    where: and(
      input.brandId
        ? eq(brandTable.id, input.brandId)
        : and(
            eq(brandTable.slug, input.brandSlug!),
            eq(brandTable.organizationId, input.organizationId),
          ),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true, organizationId: true },
  });
  if (brand?.organizationId !== input.organizationId) {
    throw new Error("No access to this brand");
  }
  return brand;
}

async function requireOwnedInitiative(
  campaignId: string,
  organizationId: string,
) {
  const initiative = await db.query.campaignTable.findFirst({
    where: eq(campaignTable.id, campaignId),
  });
  if (!initiative) throw new Error("Campaign draft not found");
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, initiative.brandId),
    columns: { id: true, slug: true, organizationId: true },
  });
  if (brand?.organizationId !== organizationId) {
    throw new Error("No access to this campaign draft");
  }
  return { initiative, brand };
}

/**
 * Create the draft: an initiative, nothing else. Platforms are recorded as
 * intent (`targetChannels`) and only become real campaigns at push time.
 */
export async function createDraftInitiative(input: {
  organizationId: string;
  brandId?: string;
  brandSlug?: string;
  name: string;
  goal?: string | null;
  landingUrl?: string | null;
  /** Intended platforms; the push decides what actually ships. */
  targetChannels?: DraftAdPlatform[];
  /** Whole dollars for the whole push. */
  budget?: number | null;
  startAt?: Date | null;
  endAt?: Date | null;
}) {
  const brand = await requireOwnedBrand(input);

  const [initiative] = await db
    .insert(campaignTable)
    .values({
      id: createId("init"),
      brandId: brand.id,
      name: input.name,
      status: "planned",
      goal: input.goal ?? null,
      landingUrl: input.landingUrl ?? null,
      targetChannels: input.targetChannels ?? ["meta_ads"],
      budget: input.budget ?? null,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
    })
    .returning();

  return {
    initiative: initiative!,
    brandSlug: brand.slug,
    path: `/app/brands/${brand.slug}/ads/draft/${initiative!.id}`,
  };
}

/**
 * Add an ad set — the targeting + budget layer every platform has (Meta ad
 * set, Google ad group). One initiative can carry several, which is how a
 * real prospecting build splits audiences.
 */
export async function addDraftAdSet(input: {
  organizationId: string;
  campaignId: string;
  name: string;
  audienceTargetId?: string | null;
  budget?: number | null;
  budgetType?: "daily" | "lifetime" | null;
  optimizationGoal?: string | null;
}) {
  const { initiative, brand } = await requireOwnedInitiative(
    input.campaignId,
    input.organizationId,
  );

  const [adSet] = await db
    .insert(adSetTable)
    .values({
      id: createId("adset"),
      campaignId: initiative.id,
      brandId: brand.id,
      name: input.name.trim(),
      audienceTargetId: input.audienceTargetId ?? null,
      budget: input.budget ?? null,
      budgetType: input.budgetType ?? null,
      optimizationGoal: input.optimizationGoal ?? null,
    })
    .returning();
  return adSet!;
}

/**
 * Add a drafted ad. Creative comes from the media library (a MediaItem
 * carrying assetId) or a direct URL. Ads hang off the initiative, and
 * optionally off one of its ad sets.
 */
export async function addDraftAd(input: {
  organizationId: string;
  campaignId: string;
  adSetId?: string | null;
  name: string;
  headline?: string | null;
  body?: string | null;
  linkUrl?: string | null;
  media?: MediaItem[] | null;
  businessKey?: string | null;
}) {
  const { initiative, brand } = await requireOwnedInitiative(
    input.campaignId,
    input.organizationId,
  );

  if (input.adSetId) {
    const adSet = await db.query.adSetTable.findFirst({
      where: eq(adSetTable.id, input.adSetId),
      columns: { campaignId: true },
    });
    if (adSet?.campaignId !== initiative.id) {
      throw new Error("That ad set belongs to a different campaign draft");
    }
  }

  const businessKey =
    input.businessKey ??
    `${initiative.id}:${input.name.trim().toLowerCase().replace(/\s+/g, "-")}`;

  const [spot] = await db
    .insert(adSpotTable)
    .values({
      campaignId: initiative.id,
      adSetRowId: input.adSetId ?? null,
      brandId: brand.id,
      // Platform is intent until the push; the initiative's targetChannels
      // decide where this ad actually ships.
      platform: "meta_ads",
      name: input.name.trim(),
      headline: input.headline ?? null,
      body: input.body ?? null,
      linkUrl: input.linkUrl ?? null,
      media: input.media ?? null,
      businessKey,
    })
    .returning();
  return spot!;
}

/** The whole draft, for the draft page. */
export async function getDraftInitiative(
  organizationId: string,
  campaignId: string,
) {
  const { initiative, brand } = await requireOwnedInitiative(
    campaignId,
    organizationId,
  );
  const [adSets, spots, campaigns] = await Promise.all([
    db.query.adSetTable.findMany({
      where: eq(adSetTable.campaignId, initiative.id),
    }),
    db.query.adSpotTable.findMany({
      where: eq(adSpotTable.campaignId, initiative.id),
    }),
    db.query.platformCampaignTable.findMany({
      where: eq(platformCampaignTable.campaignId, initiative.id),
    }),
  ]);
  return { initiative, brand, adSets, spots, campaigns };
}

/**
 * Adopt a campaign born on a platform into the first-party layer: attach it
 * to an initiative, minting one when a name is given instead of an id.
 */
export async function linkCampaignToInitiative(input: {
  organizationId: string;
  platformCampaignId: string;
  campaignId?: string | null;
  newInitiativeName?: string | null;
}) {
  const campaign = await db.query.platformCampaignTable.findFirst({
    where: eq(platformCampaignTable.id, input.platformCampaignId),
  });
  if (!campaign) throw new Error("Campaign not found");
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, campaign.brandId),
    columns: { id: true, organizationId: true },
  });
  if (brand?.organizationId !== input.organizationId) {
    throw new Error("No access to this campaign");
  }

  let campaignId = input.campaignId ?? null;
  if (campaignId) {
    const initiative = await db.query.campaignTable.findFirst({
      where: eq(campaignTable.id, campaignId),
      columns: { brandId: true },
    });
    if (initiative?.brandId !== brand.id) {
      throw new Error("That initiative does not belong to this brand");
    }
  }
  if (!campaignId && input.newInitiativeName?.trim()) {
    const [initiative] = await db
      .insert(campaignTable)
      .values({
        id: createId("init"),
        brandId: brand.id,
        name: input.newInitiativeName.trim(),
        status: "active",
      })
      .returning({ id: campaignTable.id });
    campaignId = initiative!.id;
  }

  const [updated] = await db
    .update(platformCampaignTable)
    .set({ campaignId })
    .where(eq(platformCampaignTable.id, campaign.id))
    .returning({
      id: platformCampaignTable.id,
      campaignId: platformCampaignTable.campaignId,
    });
  return updated!;
}

/** The brand's initiatives, newest first — the picker's options. */
export async function listBrandInitiatives(input: {
  organizationId: string;
  brandId: string;
}) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, input.brandId),
    columns: { organizationId: true },
  });
  if (brand?.organizationId !== input.organizationId) {
    throw new Error("No access to this brand");
  }
  return db.query.campaignTable.findMany({
    where: eq(campaignTable.brandId, input.brandId),
    orderBy: [desc(campaignTable.createdAt)],
    columns: { id: true, name: true, status: true },
  });
}
