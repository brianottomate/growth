import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  adTable,
  audienceTable,
  brandTable,
  channelTable,
  personaTable,
  platformAdSetTable,
  platformAudienceTable,
  platformCampaignTable,
  campaignTable,
  type AdContent,
  type AudienceGeographyPlan,
  type AudienceType,
  type MediaItem,
  type PlatformCampaignSettings,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";

// ---- THE PLAN'S CRUD ---------------------------------------------------
//
// Everything here writes LOCAL rows only — the plan layer. Platforms are
// planned by creating a draft `platform_campaign` row (which is also where
// the authoritative budget and per-platform settings live); nothing reaches
// a provider until the push compiles the plan.

export type DraftAdPlatform = "meta_ads" | "google_ads" | "openai_ads";

const PLATFORM_LABELS: Record<DraftAdPlatform, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  openai_ads: "OpenAI Ads",
};

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

export async function requireOwnedCampaign(
  campaignId: string,
  organizationId: string,
) {
  const campaign = await db.query.campaignTable.findFirst({
    where: eq(campaignTable.id, campaignId),
  });
  if (!campaign) throw new Error("Campaign not found");
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, campaign.brandId),
    columns: {
      id: true,
      name: true,
      slug: true,
      organizationId: true,
      website: true,
    },
  });
  if (brand?.organizationId !== organizationId) {
    throw new Error("No access to this campaign");
  }
  return { campaign, brand };
}

/**
 * The brand's ads channel for a platform, created if missing. A planned
 * platform needs somewhere to hang its draft row; the channel is that
 * somewhere, and it is a lightweight local row.
 */
async function ensureAdsChannel(brandId: string, platform: DraftAdPlatform) {
  const existing = await db.query.channelTable.findFirst({
    where: and(
      eq(channelTable.brandId, brandId),
      eq(channelTable.platform, platform),
      isNull(channelTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (existing) return existing;
  const [created] = await db
    .insert(channelTable)
    .values({
      id: createId("chan"),
      brandId,
      kind: "ad",
      platform,
      handle: PLATFORM_LABELS[platform],
      connectionStatus: "disconnected",
    })
    .returning({ id: channelTable.id });
  return created!;
}

/**
 * Create the plan: a campaign, plus one draft platform_campaign row per
 * platform the operator picked. The drafts are where budget and platform
 * settings live; they are not on any provider yet.
 */
export async function createDraftCampaign(input: {
  organizationId: string;
  brandId?: string;
  brandSlug?: string;
  name: string;
  goal?: string | null;
  landingUrl?: string | null;
  description?: string | null;
  platforms?: DraftAdPlatform[];
  /** ADVISORY total, whole dollars. Seeds the platform drafts. */
  budget?: number | null;
  startAt?: Date | null;
  endAt?: Date | null;
}) {
  const brand = await requireOwnedBrand(input);

  const [campaign] = await db
    .insert(campaignTable)
    .values({
      id: createId("camp"),
      brandId: brand.id,
      name: input.name,
      status: "planned",
      goal: input.goal ?? null,
      landingUrl: input.landingUrl ?? null,
      description: input.description ?? null,
      budget: input.budget ?? null,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
    })
    .returning();

  for (const platform of input.platforms ?? ["meta_ads" as const]) {
    await planPlatformInternal({
      campaign: campaign!,
      brandId: brand.id,
      platform,
    });
  }

  return {
    campaign: campaign!,
    brandSlug: brand.slug,
    path: `/app/brands/${brand.slug}/ads/${campaign!.id}`,
  };
}

async function planPlatformInternal(input: {
  campaign: typeof campaignTable.$inferSelect;
  brandId: string;
  platform: DraftAdPlatform;
}) {
  const existing = await db.query.platformCampaignTable.findFirst({
    where: and(
      eq(platformCampaignTable.campaignId, input.campaign.id),
      eq(platformCampaignTable.platform, input.platform),
    ),
    columns: { id: true },
  });
  if (existing) return existing;
  const channel = await ensureAdsChannel(input.brandId, input.platform);
  const [created] = await db
    .insert(platformCampaignTable)
    .values({
      id: createId("pcamp"),
      channelId: channel.id,
      brandId: input.brandId,
      platform: input.platform,
      campaignId: input.campaign.id,
      name: input.campaign.name,
      status: "draft",
      // Seeded from the plan's advisory number; authoritative once edited.
      budget: input.campaign.budget,
      budgetType: "daily",
      startAt: input.campaign.startAt,
      endAt: input.campaign.endAt,
    })
    .returning({ id: platformCampaignTable.id });
  return created!;
}

/** Plan a platform: create its draft row. Idempotent per platform. */
export async function planPlatform(input: {
  organizationId: string;
  campaignId: string;
  platform: DraftAdPlatform;
}) {
  const { campaign, brand } = await requireOwnedCampaign(
    input.campaignId,
    input.organizationId,
  );
  const row = await planPlatformInternal({
    campaign,
    brandId: brand.id,
    platform: input.platform,
  });
  return { platformCampaignId: row.id };
}

/** Unplan a platform. Only a draft can go — a pushed campaign is real. */
export async function unplanPlatform(input: {
  organizationId: string;
  platformCampaignId: string;
}) {
  const row = await db.query.platformCampaignTable.findFirst({
    where: eq(platformCampaignTable.id, input.platformCampaignId),
  });
  if (!row) throw new Error("Platform campaign not found");
  if (!row.campaignId) throw new Error("Not attached to a plan");
  await requireOwnedCampaign(row.campaignId, input.organizationId);
  if (row.status !== "draft" || row.externalId) {
    throw new Error(
      "This campaign exists on the platform — delete it there instead",
    );
  }
  await db
    .delete(platformCampaignTable)
    .where(eq(platformCampaignTable.id, row.id));
  return { deleted: true };
}

/**
 * The authoritative pre-push numbers and settings on a platform draft.
 * Callers send the keys they are changing; merge per platform, explicit null
 * clears.
 */
export async function setPlatformDraft(input: {
  organizationId: string;
  platformCampaignId: string;
  budget?: number | null;
  budgetType?: "daily" | "lifetime" | null;
  google?: PlatformCampaignSettings["google"] | null;
  meta?: PlatformCampaignSettings["meta"] | null;
}) {
  const row = await db.query.platformCampaignTable.findFirst({
    where: eq(platformCampaignTable.id, input.platformCampaignId),
  });
  if (!row) throw new Error("Platform campaign not found");
  if (!row.campaignId) throw new Error("Not attached to a plan");
  await requireOwnedCampaign(row.campaignId, input.organizationId);

  const current = row.settings ?? {};
  const merge = <K extends keyof PlatformCampaignSettings>(
    key: K,
    value: PlatformCampaignSettings[K] | null | undefined,
  ) =>
    value === undefined
      ? {}
      : value === null
        ? { [key]: undefined }
        : { [key]: { ...(current[key] ?? {}), ...value } };

  const [updated] = await db
    .update(platformCampaignTable)
    .set({
      ...(input.budget !== undefined ? { budget: input.budget } : {}),
      ...(input.budgetType !== undefined
        ? { budgetType: input.budgetType }
        : {}),
      settings: {
        ...current,
        ...merge("google", input.google),
        ...merge("meta", input.meta),
      },
    })
    .where(eq(platformCampaignTable.id, row.id))
    .returning({ id: platformCampaignTable.id });
  return updated!;
}

/**
 * Add an audience — one buyable narrowing, which compiles to one ad set per
 * platform. Wanting two age ranges means two audiences.
 */
export async function addAudience(input: {
  organizationId: string;
  campaignId: string;
  name: string;
  personaId?: string | null;
  description?: string | null;
  type?: AudienceType | null;
  ageMin?: number | null;
  ageMax?: number | null;
  geography?: AudienceGeographyPlan | null;
  keywords?: string[] | null;
  optimizationGoal?: string | null;
}) {
  const { campaign, brand } = await requireOwnedCampaign(
    input.campaignId,
    input.organizationId,
  );
  if (input.personaId) {
    const persona = await db.query.personaTable.findFirst({
      where: eq(personaTable.id, input.personaId),
      columns: { brandId: true },
    });
    if (persona?.brandId !== brand.id) {
      throw new Error("That persona belongs to a different brand");
    }
  }
  const [audience] = await db
    .insert(audienceTable)
    .values({
      id: createId("aud"),
      campaignId: campaign.id,
      brandId: brand.id,
      personaId: input.personaId ?? null,
      name: input.name.trim(),
      description: input.description ?? null,
      type: input.type ?? "segment",
      ageMin: input.ageMin ?? null,
      ageMax: input.ageMax ?? null,
      geography: input.geography ?? null,
      keywords: input.keywords ?? null,
      optimizationGoal: input.optimizationGoal ?? null,
    })
    .returning();
  return audience!;
}

export async function updateAudience(input: {
  organizationId: string;
  audienceId: string;
  name?: string;
  description?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  geography?: AudienceGeographyPlan | null;
  keywords?: string[] | null;
}) {
  const audience = await db.query.audienceTable.findFirst({
    where: eq(audienceTable.id, input.audienceId),
  });
  if (!audience) throw new Error("Audience not found");
  await requireOwnedCampaign(audience.campaignId, input.organizationId);
  const { organizationId: _org, audienceId: _id, geography, ...patch } = input;
  // Geography merges key-by-key: sending only countries must not clear the
  // stored regions. Explicit null still clears the whole object.
  const mergedGeography =
    geography === undefined
      ? undefined
      : geography === null
        ? null
        : {
            ...(audience.geography ?? {}),
            ...Object.fromEntries(
              Object.entries(geography).filter(
                ([, value]) => value !== undefined,
              ),
            ),
          };
  const [updated] = await db
    .update(audienceTable)
    .set({
      ...patch,
      ...(mergedGeography !== undefined ? { geography: mergedGeography } : {}),
    })
    .where(eq(audienceTable.id, audience.id))
    .returning();
  return updated!;
}

/** Add a drafted ad: a suggestion the push transforms per platform. */
export async function addDraftAd(input: {
  organizationId: string;
  campaignId: string;
  name: string;
  type?: "creative" | "text";
  content: AdContent;
  businessKey?: string | null;
}) {
  const { campaign, brand } = await requireOwnedCampaign(
    input.campaignId,
    input.organizationId,
  );
  const businessKey =
    input.businessKey ??
    `${campaign.id}:${input.name.trim().toLowerCase().replace(/\s+/g, "-")}`;
  const [ad] = await db
    .insert(adTable)
    .values({
      id: createId("ad"),
      campaignId: campaign.id,
      brandId: brand.id,
      name: input.name.trim(),
      type: input.type ?? "creative",
      content: input.content,
      businessKey,
    })
    .returning();
  return ad!;
}

/** The whole plan, for the campaign page. */
export async function getDraftCampaign(
  organizationId: string,
  campaignId: string,
) {
  const { campaign, brand } = await requireOwnedCampaign(
    campaignId,
    organizationId,
  );
  const [audiences, ads, platformCampaigns, personas, platformAudiences] =
    await Promise.all([
      db.query.audienceTable.findMany({
        where: eq(audienceTable.campaignId, campaign.id),
        with: { persona: { columns: { id: true, name: true } } },
      }),
      db.query.adTable.findMany({
        where: eq(adTable.campaignId, campaign.id),
        orderBy: [desc(adTable.createdAt)],
      }),
      db.query.platformCampaignTable.findMany({
        where: eq(platformCampaignTable.campaignId, campaign.id),
        with: { adSets: true, ads: true },
      }),
      db.query.personaTable.findMany({
        where: and(
          eq(personaTable.brandId, brand.id),
          isNull(personaTable.deletedAt),
        ),
        columns: { id: true, name: true, ageRanges: true, geographies: true },
      }),
      db.query.platformAudienceTable.findMany({
        where: eq(platformAudienceTable.brandId, brand.id),
        columns: { id: true, name: true, type: true, sizeLabel: true },
      }),
    ]);

  return {
    campaign,
    brand,
    audiences,
    ads,
    platformCampaigns,
    personas,
    platformAudiences,
  };
}

/** Replace the campaign's shared creative pool. */
export async function setCampaignCreativePool(input: {
  organizationId: string;
  campaignId: string;
  media: MediaItem[];
}) {
  const { campaign } = await requireOwnedCampaign(
    input.campaignId,
    input.organizationId,
  );
  const [updated] = await db
    .update(campaignTable)
    .set({ creativePool: input.media })
    .where(eq(campaignTable.id, campaign.id))
    .returning({ id: campaignTable.id });
  return updated!;
}

/**
 * Adopt a platform campaign (born in Ads Manager, pulled in by sync) into
 * the plan layer: attach it to a campaign, minting one when a name is given
 * instead of an id.
 */
export async function attachPlatformCampaign(input: {
  organizationId: string;
  platformCampaignId: string;
  campaignId?: string | null;
  newCampaignName?: string | null;
}) {
  const platformCampaign = await db.query.platformCampaignTable.findFirst({
    where: eq(platformCampaignTable.id, input.platformCampaignId),
  });
  if (!platformCampaign) throw new Error("Platform campaign not found");
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, platformCampaign.brandId),
    columns: { id: true, slug: true, organizationId: true },
  });
  if (brand?.organizationId !== input.organizationId) {
    throw new Error("No access to this campaign");
  }

  let campaignId = input.campaignId ?? null;
  if (campaignId) {
    const existing = await db.query.campaignTable.findFirst({
      where: eq(campaignTable.id, campaignId),
      columns: { brandId: true },
    });
    if (existing?.brandId !== brand.id) {
      throw new Error("That campaign does not belong to this brand");
    }
  }

  if (!campaignId) {
    const name = input.newCampaignName?.trim() ?? platformCampaign.name;
    if (!name) throw new Error("Give the campaign a name");
    const [created] = await db
      .insert(campaignTable)
      .values({
        id: createId("camp"),
        brandId: brand.id,
        name,
        // Adopting something that already ran means the push is underway.
        status: "active",
        budget: platformCampaign.budget,
        startAt: platformCampaign.startAt,
        endAt: platformCampaign.endAt,
      })
      .returning({ id: campaignTable.id });
    campaignId = created!.id;
  }

  const [updated] = await db
    .update(platformCampaignTable)
    .set({ campaignId })
    .where(eq(platformCampaignTable.id, platformCampaign.id))
    .returning({
      id: platformCampaignTable.id,
      campaignId: platformCampaignTable.campaignId,
    });

  return {
    ...updated!,
    path: `/app/brands/${brand.slug}/ads/${campaignId}`,
  };
}

/** The brand's campaigns, newest first — the attach picker's options. */
export async function listBrandCampaigns(input: {
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

/**
 * Link (or unlink) a platform audience asset to the plan audience it fulfils.
 *
 * This is the adoption step for assets that predate us — the client's
 * two-year-old lookalike, a synced customer list. Once linked, the compile
 * resolves the plan audience to this asset's externalId and the ad set
 * targets it. Same-brand only: an asset cannot fulfil another brand's plan.
 */
export async function linkPlatformAudience(input: {
  organizationId: string;
  platformAudienceId: string;
  /** Plan audience to link, or null to unlink. */
  audienceId: string | null;
}) {
  const asset = await db.query.platformAudienceTable.findFirst({
    where: eq(platformAudienceTable.id, input.platformAudienceId),
  });
  if (!asset) throw new Error("Platform audience not found");
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, asset.brandId),
    columns: { organizationId: true },
  });
  if (brand?.organizationId !== input.organizationId) {
    throw new Error("No access to this audience");
  }
  if (input.audienceId) {
    const planAudience = await db.query.audienceTable.findFirst({
      where: eq(audienceTable.id, input.audienceId),
      columns: { brandId: true },
    });
    if (planAudience?.brandId !== asset.brandId) {
      throw new Error("That audience belongs to a different brand");
    }
    // One asset per platform fulfils a plan audience — the compile resolves
    // one externalId per platform, so a second link on the same platform
    // would make the targeted asset arbitrary. Linking here supersedes any
    // same-platform sibling. Links on OTHER platforms stay: the same plan
    // audience legitimately maps to one Meta asset and one Google asset.
    const channel = await db.query.channelTable.findFirst({
      where: eq(channelTable.id, asset.channelId),
      columns: { platform: true },
    });
    if (channel) {
      const siblings = await db
        .select({ id: platformAudienceTable.id })
        .from(platformAudienceTable)
        .innerJoin(
          channelTable,
          eq(channelTable.id, platformAudienceTable.channelId),
        )
        .where(
          and(
            eq(platformAudienceTable.audienceId, input.audienceId),
            eq(channelTable.platform, channel.platform),
          ),
        );
      for (const sibling of siblings) {
        if (sibling.id === asset.id) continue;
        await db
          .update(platformAudienceTable)
          .set({ audienceId: null })
          .where(eq(platformAudienceTable.id, sibling.id));
      }
    }
  }
  const [updated] = await db
    .update(platformAudienceTable)
    .set({ audienceId: input.audienceId })
    .where(eq(platformAudienceTable.id, asset.id))
    .returning({
      id: platformAudienceTable.id,
      audienceId: platformAudienceTable.audienceId,
      name: platformAudienceTable.name,
    });
  return updated!;
}

// ---- DELETE (local only) ----------------------------------------------
//
// These remove plan rows and never touch a platform. Anything with a live
// counterpart refuses: those are real objects still spending, and forgetting
// them here would not stop them.

export async function deleteDraftCampaign(input: {
  organizationId: string;
  campaignId: string;
}) {
  const { campaign } = await requireOwnedCampaign(
    input.campaignId,
    input.organizationId,
  );
  const pushed = await db.query.platformCampaignTable.findMany({
    where: eq(platformCampaignTable.campaignId, campaign.id),
    columns: { id: true, externalId: true, status: true },
  });
  const live = pushed.filter((row) => row.externalId);
  if (live.length > 0) {
    throw new Error(
      `This campaign has ${live.length} campaign(s) on a platform — delete those first, or they keep running without anything here describing them`,
    );
  }
  // Draft platform rows die with the plan; audiences and ads cascade.
  for (const row of pushed) {
    await db
      .delete(platformCampaignTable)
      .where(eq(platformCampaignTable.id, row.id));
  }
  await db.delete(campaignTable).where(eq(campaignTable.id, campaign.id));
  return { deleted: true };
}

export async function deleteAudience(input: {
  organizationId: string;
  audienceId: string;
}) {
  const audience = await db.query.audienceTable.findFirst({
    where: eq(audienceTable.id, input.audienceId),
  });
  if (!audience) throw new Error("Audience not found");
  await requireOwnedCampaign(audience.campaignId, input.organizationId);
  const compiled = await db.query.platformAdSetTable.findFirst({
    where: eq(platformAdSetTable.audienceId, audience.id),
    columns: { id: true },
  });
  if (compiled) {
    throw new Error(
      "This audience is compiled to a live ad set — pause or delete the platform campaign first",
    );
  }
  await db.delete(audienceTable).where(eq(audienceTable.id, audience.id));
  return { deleted: true };
}

export async function deleteDraftAd(input: {
  organizationId: string;
  adId: string;
}) {
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, input.adId),
  });
  if (!ad) throw new Error("Ad not found");
  await requireOwnedCampaign(ad.campaignId, input.organizationId);
  // Plan rows carry no externalId by design; the platform_ad children keep
  // their nullable lineage, so deleting the draft never touches a platform.
  await db.delete(adTable).where(eq(adTable.id, ad.id));
  return { deleted: true };
}
