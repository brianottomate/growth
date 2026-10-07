import type { DraftAdResult } from "@/server/ai/capabilities/outputs/ads";
import type { CampaignListResult } from "@/server/contracts/ad-tool-output";
import {
  listHomesInGroup,
  studioBookingDestination,
} from "./home-groups.service";
import { resolveMetaSchedule, metaScheduleIssue } from "@/lib/meta-schedule";
import "server-only";
import { withIdeaStudio } from "@/lib/ad-idea-studio";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  LINKEDIN_MIN_DAILY_BUDGET,
  LINKEDIN_MIN_LIFETIME_BUDGET,
} from "@/lib/zernio-ads";

import { db, withTransaction } from "@/server/db";
import {
  campaignExportCandidates,
  cleanupCampaignExports,
} from "./campaign-media-cleanup.service";
import {
  adTable,
  homeTable,
  audienceTable,
  campaignAudienceAssetTable,
  mediaAssetTable,
  homeMediaTable,
  brandTable,
  channelTable,
  personaTable,
  platformAdSetTable,
  platformAdTable,
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
import { newCampaignCodename } from "./campaign-codename.service";
import {
  requireAdPlatformSpec,
  type PlannableAdPlatform,
} from "@/lib/ad-platforms";
import {
  featuredStarterAdIdeas,
  shellStarterAdIdeas,
  starterAdIdeas,
} from "@/lib/starter-ad-ideas";
import { listBrandHomes, listAllBrandHomes } from "./homes.service";
import { listWanderOsListingPhotos } from "@/server/clients/wanderos-site.client";
import { brandListings, brandWebsiteId } from "./wanderos-listings.service";
import {
  ideaDocumentFromAd,
  projectIdea,
  type IdeaShape,
} from "@/lib/ad-idea-studio";
import { campaignDraftName } from "@/lib/performance-ads";
import { importRemoteImage } from "@/server/services/media.service";

// ---- THE PLAN'S CRUD ---------------------------------------------------
//
// Everything here writes LOCAL rows only — the plan layer. Platforms are
// planned by creating a draft `platform_campaign` row (which is also where
// the authoritative budget and per-platform settings live); nothing reaches
// a provider until the push compiles the plan.

/** A platform whose stage in the platform table is plan or push. */
export type DraftAdPlatform = PlannableAdPlatform;

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
    columns: {
      id: true,
      name: true,
      slug: true,
      organizationId: true,
      relationship: true,
      website: true,
    },
  });
  if (brand?.organizationId !== input.organizationId) {
    throw new Error("No access to this brand");
  }
  return brand;
}

/** One authoring owner, checked before any generation, media import or write. */
export async function resolveAdAuthoringScope(input: {
  organizationId: string;
  campaignId?: string;
  brandId?: string;
}) {
  if (Boolean(input.campaignId) === Boolean(input.brandId))
    throw new Error("Supply either campaignId or brandId.");
  if (input.campaignId) {
    const owned = await requireOwnedCampaign(
      input.campaignId,
      input.organizationId,
    );
    if (owned.campaign.deletedAt) throw new Error("Campaign not found");
    return owned;
  }
  return { campaign: null, brand: await requireOwnedBrand(input) };
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
      logo: true,
      organizationId: true,
      website: true,
      // Whether there is a paying client behind the brand, which decides
      // whether the campaign page has an intake to read from.
      relationship: true,
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
      handle: requireAdPlatformSpec(platform).label,
      connectionStatus: "disconnected",
    })
    .returning({ id: channelTable.id });
  return created!;
}

/**
 * Create a thin internal campaign. Only explicitly selected platforms get
 * a draft platform_campaign row. The drafts are where budget and platform
 * settings live; they are not on any provider yet.
 */
export async function createDraftCampaign(input: {
  organizationId: string;
  brandId?: string;
  brandSlug?: string;
  name?: string;
  goal?: string | null;
  landingUrl?: string | null;
  description?: string | null;
  platforms?: DraftAdPlatform[];
  /** ADVISORY total, whole dollars. Platform drafts set their own spend. */
  budget?: number | null;
  startAt?: Date | null;
  endAt?: Date | null;
}) {
  const brand = await requireOwnedBrand(input);
  const houseName = campaignDraftName({
    brandName: brand.name,
    isClient: brand.relationship === "client",
  });
  // Give the default label a nickname; a custom label is kept as typed.
  const codename =
    (input.name ?? houseName) === houseName
      ? await newCampaignCodename(input.organizationId)
      : null;

  const [campaign] = await db
    .insert(campaignTable)
    .values({
      id: createId("camp"),
      brandId: brand.id,
      name: codename
        ? `${houseName} · ${codename
            .split("_")
            .map((word) => word[0]!.toUpperCase() + word.slice(1))
            .join(" ")}`
        : (input.name ?? houseName),
      status: "planned",
      goal: input.goal ?? null,
      landingUrl: input.landingUrl ?? null,
      description: input.description ?? null,
      budget: input.budget ?? null,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
    })
    .returning();

  for (const platform of input.platforms ?? []) {
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
      // Left for a person to set: the plan's number is a total with no flight
      // (an intake's is monthly), so copying it in as daily overspends.
      budget: null,
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
  /**
   * Flight dates for this platform, overriding the campaign's. Here because a
   * lifetime budget is refused without an end date and this is where the
   * budget is set — and because nothing else exposed them at all, so an agent
   * told to "set an end date on the campaign" had no way to do it.
   */
  startAt?: Date | null;
  endAt?: Date | null;
  google?: PlatformCampaignSettings["google"] | null;
  meta?: PlatformCampaignSettings["meta"] | null;
  linkedin?: PlatformCampaignSettings["linkedin"] | null;
}) {
  const row = await db.query.platformCampaignTable.findFirst({
    where: eq(platformCampaignTable.id, input.platformCampaignId),
  });
  if (!row) throw new Error("Platform campaign not found");
  if (!row.campaignId) throw new Error("Not attached to a plan");
  const { campaign: parent } = await requireOwnedCampaign(
    row.campaignId,
    input.organizationId,
  );
  const parentEndAt = parent.endAt;

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
      ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
      ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
      settings: {
        ...current,
        ...merge("google", input.google),
        ...merge("meta", input.meta),
        ...merge("linkedin", input.linkedin),
      },
    })
    .where(eq(platformCampaignTable.id, row.id))
    .returning({
      id: platformCampaignTable.id,
      platform: platformCampaignTable.platform,
      budget: platformCampaignTable.budget,
      budgetType: platformCampaignTable.budgetType,
      startAt: platformCampaignTable.startAt,
      endAt: platformCampaignTable.endAt,
      settings: platformCampaignTable.settings,
    });
  const saved = updated!;

  // Read the state back rather than returning a bare id. An agent that gets
  // only `{id}` cannot tell a successful write from a dropped one, so it
  // assumes the worst and calls again — one operator watched this fire ten
  // times in a row, apologising, while every single write had in fact landed.
  // Say now what the push would refuse later. These are the same rules
  // `assertLinkedInAdPayload` enforces; the difference is that here the
  // operator is still setting the number, rather than watching a push fail.
  const warnings: string[] = [];
  if (saved.platform === "meta_ads") {
    const issue = metaScheduleIssue(
      resolveMetaSchedule({
        startAt: saved.startAt,
        endAt: saved.endAt,
        campaignStartAt: parent.startAt,
        campaignEndAt: parent.endAt,
        ...saved.settings?.meta,
      }),
      saved.budgetType,
    );
    if (issue) warnings.push(issue);
  } else if (saved.budgetType === "lifetime" && !(saved.endAt ?? parentEndAt)) {
    warnings.push(
      "This is a lifetime budget and the campaign has no end date, so the push will refuse it. Set an end date on the campaign, or switch to a daily budget.",
    );
  }
  if (saved.platform === "linkedin_ads" && saved.budget != null) {
    const floor =
      saved.budgetType === "lifetime"
        ? LINKEDIN_MIN_LIFETIME_BUDGET
        : LINKEDIN_MIN_DAILY_BUDGET;
    if (saved.budget < floor) {
      warnings.push(
        `LinkedIn's minimum ${saved.budgetType ?? "daily"} budget is ${floor}, so the push will refuse ${saved.budget}.`,
      );
    }
  }

  return { ...saved, ...(warnings.length > 0 ? { warnings } : {}) };
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
  homeIds?: string[] | null;
  description?: string | null;
  type?: AudienceType | null;
  ageMin?: number | null;
  ageMax?: number | null;
  geography?: AudienceGeographyPlan | null;
  keywords?: string[] | null;
  excludedKeywords?: string[] | null;
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
  if (input.homeIds?.length) {
    const owned = await db.query.homeTable.findMany({
      where: and(
        eq(homeTable.brandId, brand.id),
        inArray(homeTable.id, input.homeIds),
        isNull(homeTable.deletedAt),
      ),
      columns: { id: true },
    });
    if (owned.length !== new Set(input.homeIds).size)
      throw new Error("A selected home is not owned by this brand");
  }
  const [audience] = await db
    .insert(audienceTable)
    .values({
      id: createId("aud"),
      campaignId: campaign.id,
      brandId: brand.id,
      personaId: input.personaId ?? null,
      homeIds: input.homeIds ?? null,
      name: input.name.trim(),
      description: input.description ?? null,
      type: input.type ?? "segment",
      ageMin: input.ageMin ?? null,
      ageMax: input.ageMax ?? null,
      geography: input.geography ?? null,
      keywords: input.keywords ?? null,
      excludedKeywords: input.excludedKeywords ?? null,
      optimizationGoal: input.optimizationGoal ?? null,
    })
    .returning();
  return audience!;
}

export async function updateAudience(input: {
  organizationId: string;
  audienceId: string;
  name?: string;
  personaId?: string | null;
  homeIds?: string[] | null;
  description?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  geography?: AudienceGeographyPlan | null;
  keywords?: string[] | null;
  excludedKeywords?: string[] | null;
}) {
  const audience = await db.query.audienceTable.findFirst({
    where: eq(audienceTable.id, input.audienceId),
  });
  if (!audience) throw new Error("Audience not found");
  await requireOwnedCampaign(audience.campaignId, input.organizationId);
  if (input.personaId) {
    const persona = await db.query.personaTable.findFirst({
      where: and(
        eq(personaTable.id, input.personaId),
        isNull(personaTable.deletedAt),
      ),
    });
    if (persona?.brandId !== audience.brandId)
      throw new Error("Persona belongs to another brand");
  }
  if (input.homeIds?.length) {
    const homes = await db.query.homeTable.findMany({
      where: and(
        eq(homeTable.brandId, audience.brandId),
        inArray(homeTable.id, input.homeIds),
        isNull(homeTable.deletedAt),
      ),
      columns: { id: true },
    });
    if (homes.length !== new Set(input.homeIds).size)
      throw new Error("Home belongs to another brand");
  }
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

/** Read the same committed set shown on the brand's Homes page. */
export async function starterIdeaHomes(input: {
  organizationId: string;
  /** The campaign's brand, or a brand directly for the studio. */
  campaignId?: string;
  brandId?: string;
  groupId?: string;
  allHomes?: boolean;
}) {
  const brand = input.campaignId
    ? (await requireOwnedCampaign(input.campaignId, input.organizationId)).brand
    : await requireOwnedBrand({
        organizationId: input.organizationId,
        brandId: input.brandId,
      });
  const [homes, listings] = await Promise.all([
    input.allHomes
      ? listAllBrandHomes(brand.id)
      : input.groupId
        ? listHomesInGroup(brand.id, input.groupId, input.organizationId)
        : listBrandHomes(brand.id),
    brandListings(brand),
  ]);
  const featured = homes;
  const websiteId = featured.some(
    (home) => home.source === "wanderos" && !home.galleryCache?.length,
  )
    ? await brandWebsiteId(brand.id)
    : null;
  const selected = await Promise.all(
    featured.map(async (home) => {
      const listing = listings.find((l) => l.id === home.externalId);
      const gallery = home.galleryCache?.length
        ? home.galleryCache
        : websiteId && home.source === "wanderos"
          ? await listWanderOsListingPhotos({
              websiteId,
              propertyId: home.externalId,
            })
          : (listing?.gallery ?? []);
      const media = await db
        .select({
          sourceUrl: homeMediaTable.sourceUrl,
          assetUrl: mediaAssetTable.url,
          role: homeMediaTable.role,
        })
        .from(homeMediaTable)
        .leftJoin(
          mediaAssetTable,
          eq(homeMediaTable.assetId, mediaAssetTable.id),
        )
        .where(eq(homeMediaTable.homeId, home.id))
        .orderBy(asc(homeMediaTable.sortOrder));
      const excluded = new Set(
        media
          .filter((p) => p.role === "excluded")
          .map((p) => p.assetUrl ?? p.sourceUrl),
      );
      const shortlist = media
        .filter((p) => p.role === "carousel")
        .map((p) => p.assetUrl ?? p.sourceUrl)
        .filter((url): url is string => Boolean(url));
      const urls = [
        home.heroSourceUrl ?? listing?.imageUrl,
        ...(shortlist.length ? shortlist : gallery.map((p) => p.url)),
      ].filter(
        (url): url is string => Boolean(url) && !excluded.has(url ?? null),
      );
      return {
        id: home.id,
        curated: shortlist.length > 0,
        name: listing?.name ?? home.name,
        url: listing?.url ?? home.url,
        photos: [...new Set(urls)].map((url, index) => ({
          url,
          homeId: home.id,
          label: `${listing?.name ?? home.name} · Photo ${index + 1}`,
        })),
      };
    }),
  );
  const urls = selected.flatMap((home) =>
    home.photos.map((photo) => photo.url),
  );
  const assets = urls.length
    ? await db.query.mediaAssetTable.findMany({
        where: and(
          eq(mediaAssetTable.brandId, brand.id),
          eq(mediaAssetTable.status, "ready"),
          eq(mediaAssetTable.reviewStatus, "approved"),
          isNull(mediaAssetTable.deletedAt),
          inArray(mediaAssetTable.url, urls),
        ),
        columns: { id: true, url: true },
      })
    : [];
  const assetIds = new Map(assets.map((asset) => [asset.url, asset.id]));
  return selected.map((home) => ({
    ...home,
    photos: home.photos.map((photo) => ({
      ...photo,
      ...(assetIds.has(photo.url) ? { assetId: assetIds.get(photo.url)! } : {}),
    })),
  }));
}

/** The full gallery is browsed on demand, independently of an idea's shortlist. */
export async function adIdeaHomePhotos(input: {
  organizationId: string;
  adId: string;
}) {
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, input.adId),
  });
  if (!ad) throw new Error("Ad not found");
  const homes = await starterIdeaHomes({
    organizationId: input.organizationId,
    brandId: ad.brandId,
    allHomes: true,
  });
  return homes.find((home) => home.id === ad.homeId) ?? null;
}

/** Add starter ideas in creation order; retries preserve existing ideas and edits. */
export async function addStarterAdIdeas(input: {
  organizationId: string;
  campaignId?: string;
  brandId?: string;
  /** Stable request identity for a new brand batch and its retries. */
  batchId?: string;
  exportShapes?: IdeaShape[];
  bookingTargetId?: string;
  /**
   * blank: unbound placeholders. featured: the featured homes, filled with
   * their listing photos. shells: the featured homes as empty ads sized for
   * a Zernio push with nothing to fix afterwards (`ZERNIO_NATIVE_SHAPES`).
   */
  source?: "blank" | "featured" | "shells";
  homeIds?: string[];
}) {
  const { campaign, brand } = await resolveAdAuthoringScope(input);
  const source = input.source ?? "blank";
  const keyFor = {
    blank: "starter-v1",
    featured: "featured-starter-v1",
    shells: "shells-starter-v1",
  } as const;
  const ownerKey =
    campaign?.id ?? `${brand.id}:${input.batchId ?? createId("batch")}`;
  const prefix = `${ownerKey}:${keyFor[source]}:`;
  const byHome = source !== "blank";
  const available = byHome
    ? await starterIdeaHomes({ ...input, allHomes: Boolean(input.homeIds) })
    : [];
  const homes = input.homeIds
    ? available.filter((h) => input.homeIds!.includes(h.id))
    : available;
  // Shells work without homes too: unbound placeholders in the same sizes.
  if (
    byHome &&
    ((source === "featured" && !homes.length) ||
      homes.length > 10 ||
      (input.homeIds && homes.length !== new Set(input.homeIds).size))
  )
    throw new Error("Choose between 1 and 10 of this brand's featured homes.");
  if (source === "featured" && homes.some((h) => !h.photos.length))
    throw new Error(
      "A selected home has no source photo. Add a photo in Homes or start blank.",
    );
  const ideas =
    source === "featured"
      ? featuredStarterAdIdeas(homes)
      : source === "shells"
        ? shellStarterAdIdeas(homes)
        : starterAdIdeas();
  if (byHome && brand.website) {
    ideas[0]!.content.linkUrl = brand.website;
    if (ideas[0]!.content.ideaStudio)
      ideas[0]!.content.ideaStudio.document.copy.linkUrl = brand.website;
  }
  const targetId = input.bookingTargetId ?? campaign?.bookingTargetId;
  const booking = targetId
    ? await studioBookingDestination(brand.id, targetId, input.organizationId)
    : null;
  let created = 0;
  for (const idea of ideas) {
    if (input.exportShapes && idea.content.ideaStudio) {
      idea.content.ideaStudio.document.shapes = [...input.exportShapes];
      idea.content.ideaStudio.document.exportShapes = [...input.exportShapes];
    }
    if (booking) {
      idea.content.linkUrl = booking.url;
      if (idea.content.ideaStudio)
        idea.content.ideaStudio.document.copy.linkUrl = booking.url;
    }
    const projected = byHome
      ? projectIdea(
          brand.id,
          idea.content,
          { document: ideaDocumentFromAd(idea) },
          null,
        )
      : { content: idea.content };

    const rows = await db
      .insert(adTable)
      .values({
        brandId: brand.id,
        campaignId: null,
        name: idea.name,
        type: "creative",
        status: "drawn",
        ...projected,
        homeId: "homeId" in idea ? (idea.homeId as string) : null,
        businessKey: `${prefix}${idea.key}`,
        bookingTargetId: booking?.targetId ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: adTable.id });
    created += rows.length;
  }
  return { created };
}

/** Add a drafted ad: a suggestion the push transforms per platform. */
export async function addDraftAd(input: {
  organizationId: string;
  campaignId?: string;
  brandId?: string;
  name: string;
  type?: "creative" | "text";
  content: AdContent;
  businessKey?: string | null;
}): Promise<DraftAdResult> {
  const { campaign, brand } = await resolveAdAuthoringScope(input);
  const businessKey =
    input.businessKey ??
    `${campaign?.id ?? brand.id}:${input.name.trim().toLowerCase().replace(/\s+/g, "-")}`;

  // `business_key` carries a UNIQUE index, and every ad has one — a caller's,
  // or one derived from the name. A bare insert therefore threw a raw Postgres
  // error the second time anything was drafted twice: re-running "draft ads
  // from their homes" dumped the full INSERT statement into the operator's
  // face. The key means "this is the same ad", so saying it twice should
  // refresh it, not fail.
  const existing = await db.query.adTable.findFirst({
    where: eq(adTable.businessKey, businessKey),
    columns: {
      id: true,
      brandId: true,
      campaignId: true,
      content: true,
      status: true,
      updatedAt: true,
    },
  });

  if (
    existing &&
    (existing.campaignId !== null || existing.brandId !== brand.id)
  ) {
    // Keys are globally unique, so silently updating would edit an ad on a
    // DIFFERENT campaign. Refuse and say which.
    throw new Error(
      `Another campaign already has an ad keyed "${businessKey}". Give this one its own name, or edit the existing ad on campaign ${existing.campaignId}.`,
    );
  }

  const values = {
    campaignId: null,
    brandId: brand.id,
    name: input.name.trim(),
    type: input.type ?? "creative",
    content: input.content,
    businessKey,
  };

  if (existing?.status === "approved")
    throw new Error("Return this ad to Studio before editing.");
  if (existing && "media" in existing.content && existing.content.ideaStudio) {
    throw new Error(
      "This ad uses the mini studio. Edit it in Ad ideas or use saveIdea.",
    );
  }
  if (existing) {
    const [updated] = await db
      .update(adTable)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(adTable.id, existing.id),
          eq(adTable.updatedAt, existing.updatedAt),
        ),
      )
      .returning();

    if (!updated)
      throw new Error("This ad changed. Refresh before drafting again.");
    return updated;
  }

  const [ad] = await db
    .insert(adTable)
    .values(withIdeaStudio({ id: createId("ad"), ...values }))
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
        // The wall files an ad under its home; without the row the page
        // falls back to the name and its links to the home's page go dark.
        with: {
          home: {
            columns: { id: true, name: true, externalId: true, url: true },
          },
        },
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
        columns: {
          id: true,
          name: true,
          type: true,
          sizeLabel: true,
          externalId: true,
          audienceId: true,
          personaId: true,
          source: true,
          sourceId: true,
          seedMetadata: true,
        },
        with: { channel: { columns: { platform: true } } },
      }),
    ]);

  const assetLinks = await db
    .select()
    .from(campaignAudienceAssetTable)
    .where(
      inArray(
        campaignAudienceAssetTable.audienceId,
        audiences.map((a) => a.id),
      ),
    );
  return {
    assetLinks,
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

  // Back-fill `assetId` for anything already in the brand's library under the
  // same URL. Without it a pool item is a bare URL: no title on the tile, no
  // tags, no analysis, and nothing reusable on another campaign. Five clips
  // sat that way because the item was written before the file was promoted,
  // and nothing ever went back to join them up.
  const unlinked = input.media
    .filter((item) => !item.assetId)
    .map((item) => item.url);
  const linkable =
    unlinked.length > 0
      ? await db.query.mediaAssetTable.findMany({
          where: and(
            eq(mediaAssetTable.brandId, campaign.brandId),
            inArray(mediaAssetTable.url, unlinked),
            isNull(mediaAssetTable.deletedAt),
          ),
          columns: { id: true, url: true, thumbnailUrl: true },
        })
      : [];
  const byUrl = new Map(linkable.map((asset) => [asset.url!, asset]));
  const media = input.media.map((item) => {
    if (item.assetId) return item;
    const asset = byUrl.get(item.url);
    if (!asset) return item;
    return {
      ...item,
      assetId: asset.id,
      ...(item.thumbnail || !asset.thumbnailUrl
        ? {}
        : { thumbnail: asset.thumbnailUrl }),
    };
  });

  const [updated] = await db
    .update(campaignTable)
    .set({ creativePool: media })
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
  const adopted = await adoptMirrorIntoPlan({
    platformCampaignId: platformCampaign.id,
    campaignId,
    brandId: brand.id,
  });

  return {
    ...updated!,
    ...adopted,
    path: `/app/brands/${brand.slug}/ads/${campaignId}`,
  };
}

/**
 * The reverse compile: what a platform already runs, read back into the
 * plan. Every ad set without a plan audience gets one, every ad without a
 * plan idea is matched to an idea with the same words and picture or gets a
 * new one, and the mirror rows point at them. Nothing is sent anywhere; the
 * mirror stays the platform's account of itself and sync keeps refreshing it.
 *
 * Matching is by content, so the same creative running in three ad sets, or
 * on Meta and Google under one plan, is one idea.
 */
async function adoptMirrorIntoPlan(input: {
  platformCampaignId: string;
  campaignId: string;
  brandId: string;
}) {
  const [sets, mirrorAds, planAds] = await Promise.all([
    db.query.platformAdSetTable.findMany({
      where: eq(
        platformAdSetTable.platformCampaignId,
        input.platformCampaignId,
      ),
    }),
    db.query.platformAdTable.findMany({
      where: eq(platformAdTable.platformCampaignId, input.platformCampaignId),
    }),
    db.query.adTable.findMany({
      where: eq(adTable.campaignId, input.campaignId),
    }),
  ]);

  let audiencesAdopted = 0;
  for (const set of sets) {
    if (set.audienceId) continue;
    const spec = (set.targetingSpec ?? {}) as {
      ageMin?: number;
      ageMax?: number;
      countries?: string[];
    };
    const [audience] = await db
      .insert(audienceTable)
      .values({
        id: createId("aud"),
        campaignId: input.campaignId,
        brandId: input.brandId,
        name: set.name,
        description: "Read back from the platform's ad set.",
        ageMin: spec.ageMin ?? null,
        ageMax: spec.ageMax ?? null,
        geography: spec.countries?.length
          ? { countries: spec.countries }
          : null,
      })
      .returning({ id: audienceTable.id });
    await db
      .update(platformAdSetTable)
      .set({ audienceId: audience!.id })
      .where(eq(platformAdSetTable.id, set.id));
    audiencesAdopted++;
  }

  const ideaBySignature = new Map<string, string>();
  for (const ad of planAds) {
    ideaBySignature.set(planAdSignature(ad.content), ad.id);
  }
  let adsAdopted = 0;
  let adsLinked = 0;
  for (const row of mirrorAds) {
    if (row.adId) continue;
    const content = contentFromMirror(row);
    const signature = planAdSignature(content);
    let adId = ideaBySignature.get(signature);
    if (!adId) {
      const [created] = await db
        .insert(adTable)
        .values(
          withIdeaStudio({
            id: createId("ad"),
            brandId: input.brandId,
            campaignId: input.campaignId,
            name: row.name ?? "Platform ad",
            type:
              "media" in content ? ("creative" as const) : ("text" as const),
            // It already runs: the people who launched it signed it off.
            status: "approved" as const,
            approvedAt: new Date(),
            content,
          }),
        )
        .returning({ id: adTable.id });
      adId = created!.id;
      ideaBySignature.set(signature, adId);
      adsAdopted++;
    }
    await db
      .update(platformAdTable)
      .set({ adId })
      .where(eq(platformAdTable.id, row.id));
    adsLinked++;
  }
  return { audiencesAdopted, adsAdopted, adsLinked };
}

/** A plan idea in the shape the platform ad shows: pools, or copy and media. */
function contentFromMirror(row: {
  headline: string | null;
  body: string | null;
  linkUrl: string | null;
  media: MediaItem[] | null;
  thumbnailUrl: string | null;
  copy: { headlines: string[]; descriptions: string[] } | null;
}): AdContent {
  const media = row.media?.length
    ? row.media
    : row.thumbnailUrl
      ? [{ url: row.thumbnailUrl, type: "image" as const }]
      : [];
  if (media.length === 0) {
    return {
      headlines: row.copy?.headlines ?? (row.headline ? [row.headline] : []),
      descriptions: row.copy?.descriptions ?? (row.body ? [row.body] : []),
      ...(row.linkUrl ? { linkUrl: row.linkUrl } : {}),
    };
  }
  return {
    format: media.some((item) => item.type === "video")
      ? "video"
      : media.length > 1
        ? "carousel"
        : "static",
    headline: row.headline ?? "",
    body: row.body ?? "",
    ...(row.linkUrl ? { linkUrl: row.linkUrl } : {}),
    media,
  };
}

/**
 * Same words, same first picture: same idea. Picture URLs are compared
 * without their query string, since platform CDNs sign every fetch.
 */
export function planAdSignature(content: AdContent) {
  const norm = (value: string | undefined) =>
    (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!("media" in content)) {
    return `text|${norm(content.headlines[0])}|${norm(content.descriptions[0])}`;
  }
  const picture = content.media[0]?.url.split("?")[0] ?? "";
  return `creative|${norm(content.headline)}|${norm(content.body)}|${picture}`;
}

/** The brand's campaigns, newest first — the attach picker's options. */
export async function listBrandCampaigns(input: {
  organizationId: string;
  brandId: string;
}): Promise<CampaignListResult> {
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
  const channel = await db.query.channelTable.findFirst({
    where: eq(channelTable.id, asset.channelId),
    columns: { platform: true },
  });
  if (!channel) throw new Error("Audience platform not found");
  if (asset.seedMetadata && asset.seedMetadata.status !== "ready")
    throw new Error("This seed upload is not ready");
  if (input.audienceId) {
    const plan = await db.query.audienceTable.findFirst({
      where: eq(audienceTable.id, input.audienceId),
      columns: { brandId: true },
    });
    if (plan?.brandId !== asset.brandId)
      throw new Error("That audience belongs to a different brand");
    await db
      .insert(campaignAudienceAssetTable)
      .values({
        audienceId: input.audienceId,
        platformAudienceId: asset.id,
        platform: channel.platform,
      })
      .onConflictDoUpdate({
        target: [
          campaignAudienceAssetTable.audienceId,
          campaignAudienceAssetTable.platform,
        ],
        set: { platformAudienceId: asset.id },
      });
  } else {
    // Legacy null-unlink only removes this asset's original link; never other campaigns.
    if (asset.audienceId)
      await db
        .delete(campaignAudienceAssetTable)
        .where(
          and(
            eq(campaignAudienceAssetTable.audienceId, asset.audienceId),
            eq(campaignAudienceAssetTable.platformAudienceId, asset.id),
          ),
        );
    await db
      .update(platformAudienceTable)
      .set({ audienceId: null })
      .where(eq(platformAudienceTable.id, asset.id));
  }
  return { id: asset.id, audienceId: input.audienceId, name: asset.name };
}

/**
 * A stable identity for a creative file behind a platform CDN url.
 *
 * Meta signs its urls (`oh`/`oe` expire) AND rotates the edge subdomain, so
 * the same image comes back as a different string on every sync. Keying
 * dedupe on the raw url would therefore import a fresh copy each time.
 * Query and hash go; the host collapses to its registrable suffix, which
 * survives edge rotation while keeping providers distinct; the path — which
 * carries the platform's own asset id — does the identifying.
 */
export function creativeSourceKey(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const labels = url.hostname.toLowerCase().split(".");
    const suffix = labels.slice(-2).join(".");
    return `${suffix}${url.pathname}`;
  } catch {
    // Not a url we can parse: the raw string is still a consistent key.
    return rawUrl;
  }
}

/**
 * Import a live ad's creative into the brand's media library.
 *
 * Mirror rows hold platform CDN urls, and Meta's are signed and EXPIRE — a
 * proven creative is unusable for new drafts until it lives in R2. Dedupes
 * by source url, so re-clicking returns the existing asset. A video ad
 * imports its poster only: the clip itself is not on a fetchable public url.
 */
export async function importPlatformAdCreative(input: {
  organizationId: string;
  userId: string;
  platformAdId: string;
}) {
  const ad = await db.query.platformAdTable.findFirst({
    where: eq(platformAdTable.id, input.platformAdId),
  });
  if (!ad) throw new Error("Platform ad not found");
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, ad.brandId),
    columns: { id: true, organizationId: true },
  });
  if (brand?.organizationId !== input.organizationId) {
    throw new Error("No access to this ad");
  }

  const lead = ad.media?.[0];
  const isVideo = lead?.type === "video";
  const sourceUrl = isVideo
    ? (lead?.thumbnail ?? ad.thumbnailUrl)
    : (lead?.url ?? ad.thumbnailUrl);
  if (!sourceUrl) {
    throw new Error(
      isVideo
        ? "This video ad has no poster image to import"
        : "This ad carries no creative url to import",
    );
  }

  // Two ads sharing one creative file dedupe to one library asset, which is
  // the point: the library holds creatives, not ad rows.
  const sourceKey = creativeSourceKey(sourceUrl);
  const existing = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.brandId, brand.id),
      sql`${mediaAssetTable.metadata} ->> 'sourceKey' = ${sourceKey}`,
    ),
    columns: { id: true, url: true, title: true },
  });
  if (existing) {
    return { asset: existing, deduped: true, videoPosterOnly: isVideo };
  }

  const asset = await importRemoteImage({
    brandId: brand.id,
    uploadedBy: input.userId,
    url: sourceUrl,
    title:
      (ad.name ?? ad.headline ?? "Imported ad creative") +
      (isVideo ? " (video poster)" : ""),
  });
  // Provenance beyond the generic remote_import marker: which live ad this
  // creative came from, so performance context is one join away.
  await db
    .update(mediaAssetTable)
    .set({
      metadata: {
        ...(asset.metadata as Record<string, unknown>),
        source: "ad_import",
        platformAdId: ad.id,
        // The dedupe key, stored because the raw sourceUrl it came from is
        // signed and will not match itself on the next sync.
        sourceKey,
      },
    })
    .where(eq(mediaAssetTable.id, asset.id));

  return {
    asset: { id: asset.id, url: asset.url, title: asset.title },
    deduped: false,
    videoPosterOnly: isVideo,
  };
}

// ---- DELETE (local only) ----------------------------------------------
//
// These remove plan rows and never touch a platform. Anything with a live
// counterpart refuses: those are real objects still spending, and forgetting
// them here would not stop them.

export async function deleteDraftCampaign(input: {
  organizationId: string;
  campaignId: string;
  /**
   * Delete the plan only and leave the platform campaigns running. They stay
   * as synced rows with no plan, so nothing is hidden, but they keep
   * spending: only an operator's explicit choice reaches this.
   */
  leaveOnPlatform?: boolean;
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
  if (live.length > 0 && !input.leaveOnPlatform) {
    throw new Error(
      `This campaign has ${live.length} campaign(s) on a platform — delete those first, or they keep running without anything here describing them`,
    );
  }
  const ads = await db.query.adTable.findMany({
    where: eq(adTable.campaignId, campaign.id),
    columns: { id: true },
  });
  const exports = await campaignExportCandidates(
    campaign.brandId,
    campaign.id,
    ads.map((ad) => ad.id),
  );
  await withTransaction(async (tx) => {
    // Local cascades remove plan ads and audiences; retained live rows preserve their references.
    for (const row of pushed.filter((row) => !row.externalId))
      await tx
        .delete(platformCampaignTable)
        .where(eq(platformCampaignTable.id, row.id));
    await tx.delete(campaignTable).where(eq(campaignTable.id, campaign.id));
  });
  const mediaCleanup = await cleanupCampaignExports(exports);
  return { deleted: true, mediaCleanup };
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

/**
 * Swap one card on a drafted ad for a library asset. The card's slot keeps
 * its place in the carousel; the new asset's own dimensions travel with it.
 */
export async function replaceDraftAdMedia(input: {
  organizationId: string;
  adId: string;
  index: number;
  mediaAssetId: string;
}) {
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, input.adId),
  });
  if (!ad) throw new Error("Ad not found");
  // A draft ad has no campaign yet; ownership then comes from its brand.
  const brand = ad.campaignId
    ? (await requireOwnedCampaign(ad.campaignId, input.organizationId)).brand
    : await requireOwnedBrand({
        organizationId: input.organizationId,
        brandId: ad.brandId,
      });
  if (ad.status === "approved")
    throw new Error("Return this ad to Studio before editing.");
  const content = ad.content;
  if (!("media" in content) || !Array.isArray(content.media)) {
    throw new Error("This ad has no cards to replace");
  }
  if (content.ideaStudio)
    throw new Error(
      "This ad uses the mini studio. Replace its image in Ad ideas or use saveIdea.",
    );
  if (input.index < 0 || input.index >= content.media.length) {
    throw new Error(
      `This ad has ${content.media.length} card(s); there is no card ${input.index + 1}`,
    );
  }
  const asset = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.id, input.mediaAssetId),
      eq(mediaAssetTable.brandId, brand.id),
      eq(mediaAssetTable.status, "ready"),
      eq(mediaAssetTable.reviewStatus, "approved"),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: {
      id: true,
      url: true,
      width: true,
      height: true,
      kind: true,
      metadata: true,
    },
  });
  if (!asset?.url)
    throw new Error("That library asset is not available for this brand");
  const previous = content.media[input.index]!;
  const derivedFrom =
    (
      asset.metadata as {
        composition?: { sourceMediaAssetId?: string | null };
      } | null
    )?.composition?.sourceMediaAssetId ?? undefined;
  const media = [...content.media];
  media[input.index] = {
    url: asset.url,
    type: asset.kind === "video" ? "video" : "image",
    assetId: asset.id,
    ...(asset.width && asset.height
      ? { width: asset.width, height: asset.height }
      : {}),
    ...(derivedFrom ? { derivedFrom } : {}),
  };
  const [updated] = await db
    .update(adTable)
    .set({
      content: { ...content, media },
    })
    .where(and(eq(adTable.id, ad.id), eq(adTable.updatedAt, ad.updatedAt)))
    .returning();
  if (!updated)
    throw new Error("This ad changed. Refresh before replacing its media.");
  return { ad: updated, replaced: previous };
}
