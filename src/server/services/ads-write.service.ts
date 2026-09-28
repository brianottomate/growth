import { applyMetaTrackingDefaults } from "@/lib/meta-tracking";
import { metaTrackingDefaults } from "./meta-tracking-defaults";
import { resolveMetaSchedule, metaScheduleIssue } from "@/lib/meta-schedule";
import { adsConnectionProfile } from "./ads-connection-profile";
import {
  META_DEFAULT_PLACEMENTS,
  isFeedPlacement,
  metaPlacementPlanSchema,
  metaPlacementMedia,
  metaProviderPlacements,
} from "@/lib/meta-placement-plan";
import { ideaAwaitingArtwork } from "@/lib/ad-idea-studio";
import { META_URL_TAGS } from "@/lib/ad-utm";
import "server-only";

import { createHash } from "node:crypto";

import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import {
  adWriteIdempotencyKey,
  allowlistPlatform,
  googleCreativeRequirement,
  LINKEDIN_CALL_TO_ACTIONS,
  LINKEDIN_CAROUSEL_CARDS,
  LINKEDIN_HEADLINE_MAX,
  LINKEDIN_MIN_DAILY_BUDGET,
  LINKEDIN_MIN_LIFETIME_BUDGET,
  LINKEDIN_PUSH_GOALS,
  linkedInCreativeRequirement,
  linkedInDraftProviderControls,
  META_DEFAULT_CALL_TO_ACTION,
  metaCallToActionType,
  metaDraftProviderControls,
  sameAdAccountId,
  type ZernioAdPlatform,
  ZERNIO_AD_PLATFORMS,
  zernioConnectionMatchesPlatform,
} from "@/lib/zernio-ads";
import {
  adPlatformSpec,
  channelPlatformForZernioKey,
  requireAdPlatformSpec,
  zernioAdPlatformKey,
  type AdPushGoal,
  type PushableAdPlatform,
} from "@/lib/ad-platforms";
import {
  addUsersToZernioAdAudience,
  boostZernioMetaPost,
  createZernioAdAudience,
  createZernioAdCampaign,
  createZernioCustomConversion,
  listZernioCustomConversions,
  deleteZernioCampaign,
  createZernioStandaloneAd,
  duplicateZernioMetaCampaign,
  getZernioAdsTree,
  listZernioAccounts,
  listZernioAdPages,
  listZernioAdAccounts,
  listZernioAdAudiences,
  generateZernioAdPreviews,
  generateZernioKeywordIdeas,
  generateZernioKeywordHistoricalMetrics,
  searchZernioTargeting,
  setZernioCampaignStatus,
  ZERNIO_AUDIENCE_USERS_MAX_PER_REQUEST,
  type CreateZernioStandaloneAdInput,
  type ZernioAccount,
  type ZernioAdTargeting,
  type ZernioPlacementAssets,
  type ZernioAdWriteResponse,
  type ZernioAudienceUser,
  type ZernioCarouselCard,
  writtenAdSetId,
  writtenCampaignId,
} from "@/server/clients/zernio.client";
import { db } from "@/server/db";
import { normalizeDomain } from "@/server/services/hubspot-contact-mirror";
import { usStateName } from "@/lib/us-states";
import {
  adFormatFor,
  hostScopedConversionRule,
  performanceConversionName,
  reusableCustomConversion,
  audienceLabelForPlan,
  performanceAdName,
  performanceAdSetName,
  performanceCampaignName,
} from "@/lib/performance-ads";
import {
  adAccountTable,
  adTable,
  audienceTable,
  platformAdSetTable,
  platformAdTable,
  platformAudienceTable,
  personaTable,
  type Ad,
  type AdCreativeContent,
  type AdTextContent,
  type AudienceSource,
  type AudienceType,
  type Campaign,
  type MediaItem,
  type PlanAudience,
  type PlatformCampaign,
  type PlatformCampaignSettings,
  brandTable,
  platformCampaignTable,
  channelTable,
  campaignTable,
  type Brand,
  type PlatformCampaignStatus,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";

type AdsWriteContext = { organizationId: string; runId: string };

type AdDestination = {
  brand: Pick<Brand, "id" | "slug" | "name" | "zernioProfileId" | "metaPageId">;
  connection: ZernioAccount;
  adAccount: {
    id: string;
    name?: string;
    currency?: string;
    minimumDailyBudget?: number;
  };
};

function zernioAccountId(account: ZernioAccount): string | null {
  return account._id ?? account.id ?? null;
}

function zernioProfileId(account: ZernioAccount): string | null {
  return typeof account.profileId === "string"
    ? account.profileId
    : (account.profileId?._id ?? null);
}

function connectionAvailable(account: ZernioAccount): boolean {
  return (
    account.isActive !== false &&
    account.enabled !== false &&
    account.platformStatus?.toLowerCase() !== "error"
  );
}

async function resolveOwnedBrand(organizationId: string, brandSlug: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.organizationId, organizationId),
      eq(brandTable.slug, brandSlug),
      isNull(brandTable.deletedAt),
    ),
    columns: {
      id: true,
      slug: true,
      name: true,
      zernioProfileId: true,
      metaPageId: true,
      performanceSettings: true,
      organizationId: true,
    },
  });
  if (!brand) throw new Error(`Owned brand not found: ${brandSlug}`);
  brand.zernioProfileId = await adsConnectionProfile(brand);
  if (!brand.zernioProfileId) {
    throw new Error(
      `${brand.name} needs its own Zernio connection or an explicitly shared ads connection.`,
    );
  }
  return brand;
}

/**
 * Whether a Meta connection can run as the Page a brand is bound to. A brand
 * with no Page recorded yet passes; an unreadable connection identity fails,
 * because "unknown" is not "theirs". Pure, so the guard is testable.
 */
export function connectionRunsAsBrandPage(
  brand: { metaPageId: string | null },
  connection: { platformUserId?: string | null },
  grantedPageIds: string[] = [],
): boolean {
  if (!brand.metaPageId) return true;
  return (
    metaPageIdFromConnection(connection.platformUserId) === brand.metaPageId ||
    grantedPageIds.includes(brand.metaPageId)
  );
}

async function allowedAccountsForBrand(
  brandId: string,
  platform: ZernioAdPlatform,
) {
  return db
    .select({
      externalId: adAccountTable.externalId,
      name: adAccountTable.name,
    })
    .from(adAccountTable)
    .where(
      and(
        eq(adAccountTable.brandId, brandId),
        eq(adAccountTable.platform, allowlistPlatform(platform)),
        eq(adAccountTable.isAllowed, true),
      ),
    );
}

function matchingConnections(
  accounts: ZernioAccount[],
  profileId: string,
  platform: ZernioAdPlatform,
) {
  return accounts.filter(
    (account) =>
      zernioProfileId(account) === profileId &&
      zernioConnectionMatchesPlatform(platform, account.platform) &&
      connectionAvailable(account) &&
      zernioAccountId(account),
  );
}

export async function listAdsWriteDestinations(input: {
  organizationId: string;
  brandSlug: string;
  platform: ZernioAdPlatform;
}) {
  const brand = await resolveOwnedBrand(input.organizationId, input.brandSlug);
  const [accounts, allowed] = await Promise.all([
    listZernioAccounts(),
    allowedAccountsForBrand(brand.id, input.platform),
  ]);
  const connections = matchingConnections(
    accounts,
    brand.zernioProfileId!,
    input.platform,
  );

  const destinationResults = await Promise.allSettled(
    connections.map(async (connection) => {
      const connectionId = zernioAccountId(connection)!;
      const providerAccounts = await listZernioAdAccounts({
        accountId: connectionId,
        limit: 1000,
      });
      const tracking = new Map(
        await Promise.all(
          allowed.map(
            async (row) =>
              [
                row.externalId,
                await metaTrackingDefaults(brand.id, row.externalId),
              ] as const,
          ),
        ),
      );
      const grants = new Map<string, string[]>();
      if (
        input.platform === "meta" &&
        brand.metaPageId &&
        !connectionRunsAsBrandPage(brand, connection)
      ) {
        for (const account of providerAccounts.filter((account) =>
          allowed.some((row) =>
            sameAdAccountId(input.platform, row.externalId, account.id),
          ),
        )) {
          grants.set(
            account.id,
            (await listZernioAdPages(connectionId, account.id)).map(
              (page) => page.pageId,
            ),
          );
        }
      }
      return providerAccounts.flatMap((adAccount) => {
        const allowedRow = allowed.find((row) =>
          sameAdAccountId(input.platform, row.externalId, adAccount.id),
        );
        if (!allowedRow || adAccount.selectable === false) return [];
        const pageId =
          input.platform === "meta"
            ? (brand.metaPageId ??
              metaPageIdFromConnection(connection.platformUserId))
            : null;
        return [
          {
            connectionAccountId: connectionId,
            connectionName:
              connection.displayName ?? connection.name ?? connection.username,
            adAccountId: adAccount.id,
            adAccountName: adAccount.name ?? allowedRow.name ?? undefined,
            trackingDefaults: tracking.get(allowedRow.externalId),
            currency: adAccount.currency,
            minimumDailyBudget: adAccount.minimumDailyBudget,
            /** Meta: the Page the ads would run as, read off the connection. */
            pageId,
            /** False when the brand is bound to a different Page; the push refuses it. */
            runsAsBrandPage:
              input.platform === "meta"
                ? connectionRunsAsBrandPage(
                    brand,
                    connection,
                    grants.get(adAccount.id),
                  )
                : true,
          },
        ];
      });
    }),
  );
  const destinations = destinationResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const connectionErrors = destinationResults.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            connectionAccountId: zernioAccountId(connections[index]!)!,
            message:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          },
        ]
      : [],
  );

  return {
    brand: {
      id: brand.id,
      slug: brand.slug,
      name: brand.name,
      metaPageId: brand.metaPageId,
    },
    platform: input.platform,
    destinations,
    connectionErrors,
  };
}

async function requireAdDestination(input: {
  organizationId: string;
  brandSlug: string;
  platform: ZernioAdPlatform;
  connectionAccountId: string;
  adAccountId: string;
}): Promise<AdDestination> {
  const brand = await resolveOwnedBrand(input.organizationId, input.brandSlug);
  const [accounts, allowed] = await Promise.all([
    listZernioAccounts(),
    allowedAccountsForBrand(brand.id, input.platform),
  ]);
  const connection = matchingConnections(
    accounts,
    brand.zernioProfileId!,
    input.platform,
  ).find(
    (candidate) => zernioAccountId(candidate) === input.connectionAccountId,
  );
  if (!connection) {
    // Name the ids that WOULD work. The old message said only that this one
    // was not active, which reads as "the connection is broken" — and sent an
    // operator hunting a health problem when the real answer was that they
    // had passed a social Page connection, or one from another platform's
    // destination list, and a valid id was sitting right there.
    const usable = matchingConnections(
      accounts,
      brand.zernioProfileId!,
      input.platform,
    )
      .map((candidate) => zernioAccountId(candidate))
      .filter((id): id is string => Boolean(id));
    throw new Error(
      `${input.connectionAccountId} is not a usable ${input.platform} connection for ${brand.name}. ${
        usable.length > 0
          ? `Use one of: ${usable.join(", ")} — take it from adsRead.listDestinations for THIS platform, not another one.`
          : `${brand.name} has no active ${input.platform} connection at all, so connect one in Zernio first.`
      }`,
    );
  }
  if (
    !allowed.some((row) =>
      sameAdAccountId(input.platform, row.externalId, input.adAccountId),
    )
  ) {
    throw new Error(
      `Ad account ${input.adAccountId} is outside ${brand.name}'s allowlist`,
    );
  }
  // A shared connection may serve a granted brand Page via per-ad pageId.
  if (
    input.platform === "meta" &&
    !connectionRunsAsBrandPage(brand, connection)
  ) {
    const pages = await listZernioAdPages(
      input.connectionAccountId,
      input.adAccountId,
    );
    if (
      !connectionRunsAsBrandPage(
        brand,
        connection,
        pages.map((page) => page.pageId),
      )
    ) {
      throw new Error(
        `Connection cannot advertise as ${brand.name}'s Facebook Page ${brand.metaPageId}.`,
      );
    }
  }

  const providerAccounts = await listZernioAdAccounts({
    accountId: input.connectionAccountId,
    adAccountId: input.adAccountId,
    limit: 1,
  });
  const adAccount = providerAccounts.find((candidate) =>
    sameAdAccountId(input.platform, candidate.id, input.adAccountId),
  );
  if (!adAccount) {
    throw new Error(
      `Zernio connection ${input.connectionAccountId} cannot reach ad account ${input.adAccountId}`,
    );
  }
  if (adAccount.selectable === false) {
    throw new Error(
      adAccount.unusableReason ??
        `Ad account ${adAccount.id} is not selectable`,
    );
  }
  return {
    brand,
    connection,
    adAccount: {
      id: adAccount.id,
      name: adAccount.name,
      currency: adAccount.currency,
      minimumDailyBudget: adAccount.minimumDailyBudget,
    },
  };
}

/**
 * A push key is RUN-scoped, deliberately.
 *
 * A business key ignores runId so a re-run replays rather than opening a
 * second campaign — right for a List+ deal create, wrong here. A push that
 * fails partway stores its response under that stable key, so every later
 * attempt replays it: after the orphaned entities were deleted, the replay
 * handed back a campaign id LinkedIn no longer had and the attach 404'd. The
 * campaign became permanently un-pushable.
 *
 * Duplicate protection does not depend on this: the push refuses outright
 * when the draft already carries an externalId, which is a stronger local
 * guard. Run scope still replays a genuine in-flight retry, because runId and
 * payload are identical there.
 */
/**
 * After a failed push deletes its shell, the next attempt must mint a new
 * one. The shell's key carries the draft's edit time, so moving that time on
 * is what stops Zernio replaying the deleted campaign (Legacy RnR, 2026-09-28:
 * "Ad Sets may not be added to deleted Campaigns").
 */
async function retireShellKey(draftId: string) {
  await db
    .update(platformCampaignTable)
    .set({ updatedAt: new Date() })
    .where(eq(platformCampaignTable.id, draftId))
    .catch((error: unknown) =>
      console.error("could not retire the shell key", draftId, error),
    );
}

function idempotencyKey(
  context: AdsWriteContext,
  action: string,
  payload: unknown,
  businessKey?: string | null,
): string {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 24);
  return adWriteIdempotencyKey({
    action,
    runId: context.runId,
    payloadHash,
    businessKey,
  });
}

export type CreateMetaAdDraftInput = {
  /** Stable cross-run dedupe key; see adWriteIdempotencyKey. */
  businessKey?: string | null;
  brandSlug: string;
  connectionAccountId: string;
  adAccountId: string;
  name: string;
  campaignName?: string;
  adSetName?: string;
  adName?: string;
  goal: CreateZernioStandaloneAdInput["goal"];
  budgetAmount: number;
  budgetType: "daily" | "lifetime";
  headline: string;
  body: string;
  description?: string;
  callToAction: string;
  linkUrl: string;
  imageUrl?: string;
  /** 2–10 hand-built cards; mutually exclusive with imageUrl. */
  carouselCards?: ZernioCarouselCard[];
  leadGenFormId?: string;
  targeting?: ZernioAdTargeting;
  startDate?: string;
  endDate?: string;
  validateOnly?: boolean;
  promotedObject?: CreateZernioStandaloneAdInput["promotedObject"];
};

/**
 * Everything Meta rejects, checked once against the payload the API actually
 * receives rather than against any one caller's input shape.
 *
 * Three call sites build a Meta payload — the single draft, the single-ad-set
 * push, and the per-ad-set push — and for a while only the first carried these
 * rules. That is how a push shipped without the lifetime-budget end date the
 * draft path had guarded from the start. Add a rule here, not at a call site.
 */
export function assertMetaAdPayload(
  payload: CreateZernioStandaloneAdInput,
  adAccount: { currency?: string; minimumDailyBudget?: number },
) {
  const { goal, promotedObject } = payload;

  // Budget has an owner. Normally this call's ad set, but an attach inherits
  // it from the ad set it joins, and an ad set under a CBO campaign inherits
  // it from the campaign.
  const inheritsBudget = Boolean(payload.adSetId ?? payload.existingCampaignId);
  if (payload.budgetAmount === undefined && !inheritsBudget) {
    throw new Error("This Meta ad needs a budget, or an ad set to inherit one");
  }
  if (payload.budgetType === "lifetime" && !payload.endDate) {
    throw new Error("Meta lifetime budgets require endDate");
  }
  if (
    !payload.adSetId &&
    goal === "catalog_sales" &&
    (!promotedObject?.productSetId ||
      !promotedObject.pixelId ||
      !promotedObject.customEventType)
  ) {
    throw new Error(
      "Meta catalog sales require promotedObject.productSetId, pixelId, and customEventType",
    );
  }
  // Meta takes EITHER a pixel + event OR a custom conversion on its own;
  // sending the pixel alongside the conversion is rejected (subcode 1885014).
  if (
    !payload.adSetId &&
    (goal === "conversions" || goal === "lead_conversion") &&
    !promotedObject?.customConversionId &&
    (!promotedObject?.pixelId || !promotedObject.customEventType)
  ) {
    throw new Error(
      `${goal} requires promotedObject.pixelId and customEventType, or a customConversionId`,
    );
  }
  if (promotedObject?.customConversionId && promotedObject.pixelId) {
    throw new Error(
      "promotedObject.customConversionId must be sent without pixelId — Meta rejects the pair",
    );
  }
  if (
    !payload.adSetId &&
    goal === "lead_generation" &&
    !payload.leadGenFormId
  ) {
    throw new Error("Meta lead generation requires leadGenFormId");
  }
  if (
    !payload.adSetId &&
    goal === "app_promotion" &&
    (!promotedObject?.applicationId || !promotedObject.objectStoreUrl)
  ) {
    throw new Error(
      "Meta app promotion requires promotedObject.applicationId and objectStoreUrl",
    );
  }

  // The three creative shapes are mutually exclusive, and one of them has to
  // be there — except for catalog sales, where the product set is the creative.
  const shapes = [
    payload.existingCreativeId ? "existingCreativeId" : null,
    payload.imageUrl ? "imageUrl" : null,
    payload.video ? "video" : null,
    payload.carouselCards ? "carouselCards" : null,
    payload.creatives?.length ? "creatives" : null,
  ].filter(Boolean);
  if (shapes.length > 1) {
    throw new Error(
      `Provide one creative shape, not ${shapes.length} (${shapes.join(", ")})`,
    );
  }
  if (shapes.length === 0 && goal !== "catalog_sales") {
    throw new Error(
      "This Meta ad needs an image, a video, a carousel, or a creatives array",
    );
  }
  if (
    payload.carouselCards &&
    (payload.carouselCards.length < 2 || payload.carouselCards.length > 10)
  ) {
    throw new Error("Meta carousels take 2\u201310 cards");
  }
  // Zernio refuses a Meta ad without one; the attach shape inherits it, and
  // the catalog shape has no button of its own.
  if (!payload.adSetId && goal !== "catalog_sales" && !payload.callToAction) {
    throw new Error(
      "callToAction is required for Meta ads, e.g. LEARN_MORE or BOOK_NOW",
    );
  }
  payload.creatives?.forEach((creative, index) => {
    for (const field of ["headline", "body"] as const) {
      if (!creative[field]?.trim()) {
        throw new Error(`creatives[${index}].${field} is required`);
      }
    }
    // One creative, one medium: an image url or a video object, never both.
    if (Boolean(creative.imageUrl) === Boolean(creative.video)) {
      throw new Error(
        `creatives[${index}] needs exactly one of imageUrl or video`,
      );
    }
    if (creative.video && !creative.video.thumbnailUrl) {
      // Meta's video creative wants the still thumbnail alongside the url.
      throw new Error(
        `creatives[${index}].video.thumbnailUrl is required — Meta wants a still image with the clip`,
      );
    }
  });

  if (
    payload.budgetType === "daily" &&
    payload.budgetAmount !== undefined &&
    adAccount.minimumDailyBudget !== undefined &&
    payload.budgetAmount < adAccount.minimumDailyBudget
  ) {
    throw new Error(
      `Meta daily budget must be at least ${adAccount.minimumDailyBudget} ${adAccount.currency ?? "in the account currency"}`,
    );
  }
}

/**
 * Put the house UTMs on the creative's URL parameters. Zernio takes
 * `tracking` per ad, not per ad set, so every create and attach sends it.
 */
export function tagMetaAdUtms(
  payload: CreateZernioStandaloneAdInput,
): CreateZernioStandaloneAdInput {
  return {
    ...payload,
    tracking: { ...payload.tracking, urlTags: [...META_URL_TAGS] },
  };
}

/** The only way this service creates a Meta ad. Validates, then sends. */
async function createMetaAd(
  payload: CreateZernioStandaloneAdInput,
  options: {
    pageId: string | null;
    idempotencyKey: string;
    adAccount: { currency?: string; minimumDailyBudget?: number };
    carouselSeedBudget?: number;
  },
) {
  const tagged = tagMetaAdUtms({
    ...payload,
    pageId: options.pageId ?? undefined,
  });
  assertMetaAdPayload(tagged, options.adAccount);
  return createZernioStandaloneAd(tagged, {
    idempotencyKey: options.idempotencyKey,
    carouselSeedBudget: options.carouselSeedBudget,
  });
}

export async function createMetaAdDraft(
  input: CreateMetaAdDraftInput,
  context: AdsWriteContext,
) {
  const destination = await requireAdDestination({
    organizationId: context.organizationId,
    brandSlug: input.brandSlug,
    platform: "meta",
    connectionAccountId: input.connectionAccountId,
    adAccountId: input.adAccountId,
  });
  const payload: CreateZernioStandaloneAdInput = {
    accountId: input.connectionAccountId,
    adAccountId: destination.adAccount.id,
    name: input.name,
    campaignName: input.campaignName,
    adSetName: input.adSetName,
    adName: input.adName,
    goal: input.goal,
    budgetAmount: input.budgetAmount,
    budgetType: input.budgetType,
    headline: input.headline,
    body: input.body,
    description: input.description,
    callToAction: input.callToAction,
    linkUrl: input.linkUrl,
    imageUrl: input.imageUrl,
    carouselCards: input.carouselCards,
    leadGenFormId: input.leadGenFormId,
    targeting: input.targeting,
    startDate: input.startDate,
    endDate: input.endDate,
    promotedObject: input.promotedObject,
    ...metaDraftProviderControls(input.validateOnly),
  };
  const result = await createMetaAd(payload, {
    pageId:
      destination.brand.metaPageId ??
      metaPageIdFromConnection(destination.connection.platformUserId),
    idempotencyKey: idempotencyKey(
      context,
      "create-meta",
      payload,
      input.businessKey,
    ),
    adAccount: destination.adAccount,
  });
  return {
    brand: destination.brand,
    connectionAccountId: input.connectionAccountId,
    adAccount: destination.adAccount,
    requestedStatus: "PAUSED" as const,
    validateOnly: input.validateOnly ?? false,
    provider: result,
  };
}

// ---- LINKEDIN PAYLOAD RULES ---------------------------------------------

/**
 * Everything LinkedIn (through Zernio) rejects, checked against the payload
 * the API receives — one ruleset for the opening create and the attach shape,
 * for the same reason assertMetaAdPayload exists.
 * https://docs.zernio.com/platforms/linkedin-ads/create-ads
 */
export function assertLinkedInAdPayload(
  payload: CreateZernioStandaloneAdInput,
  adAccount: { currency?: string; minimumDailyBudget?: number },
) {
  const attaching = Boolean(payload.adSetId);
  if (payload.creatives) {
    throw new Error(
      "LinkedIn takes one creative per call — Zernio's creatives[] shape is Meta only",
    );
  }
  if (payload.carouselCards) {
    throw new Error(
      "LinkedIn carousels ride on platformSpecificData.carousel, not carouselCards",
    );
  }
  if (payload.validateOnly) {
    throw new Error("LinkedIn has no dry run through Zernio");
  }
  if (!(LINKEDIN_PUSH_GOALS as readonly string[]).includes(payload.goal)) {
    throw new Error(
      `LinkedIn creates ${LINKEDIN_PUSH_GOALS.join(", ")} campaigns through Zernio, not ${payload.goal}`,
    );
  }
  const carousel = payload.platformSpecificData?.carousel;
  const shapes = [payload.imageUrl, payload.video, carousel].filter(
    Boolean,
  ).length;
  if (shapes !== 1) {
    throw new Error(
      "A LinkedIn creative needs exactly one of an image, a video or a carousel",
    );
  }
  // Typed as required, but it arrives from JSONB and can be missing at runtime.
  const headline = (payload.headline as string | undefined)?.trim() ?? "";
  if (!headline) throw new Error("LinkedIn ads need a headline");
  if (headline.length > LINKEDIN_HEADLINE_MAX) {
    throw new Error(
      `LinkedIn headlines are at most ${LINKEDIN_HEADLINE_MAX} characters`,
    );
  }
  if (payload.goal === "traffic" && !payload.linkUrl) {
    throw new Error("LinkedIn traffic ads need a link URL");
  }
  if (payload.goal === "video_views" && !payload.video) {
    throw new Error("LinkedIn video_views needs a video creative");
  }
  if (
    payload.callToAction &&
    !(LINKEDIN_CALL_TO_ACTIONS as readonly string[]).includes(
      payload.callToAction,
    )
  ) {
    throw new Error(
      `LinkedIn does not offer the ${payload.callToAction} call to action`,
    );
  }
  if (carousel) {
    const cards = carousel.cards;
    if (
      cards.length < LINKEDIN_CAROUSEL_CARDS.min ||
      cards.length > LINKEDIN_CAROUSEL_CARDS.max
    ) {
      throw new Error(
        `LinkedIn carousels take ${LINKEDIN_CAROUSEL_CARDS.min}–${LINKEDIN_CAROUSEL_CARDS.max} cards`,
      );
    }
    if (cards.some((card) => !card.landingUrl && !payload.linkUrl)) {
      throw new Error(
        "Every LinkedIn carousel card needs a landing URL, or the ad a link URL to fall back on",
      );
    }
  }
  const bidding = payload.platformSpecificData ?? {};
  if (bidding.unitCost != null && !bidding.costType) {
    throw new Error("A LinkedIn manual bid (unitCost) needs its costType");
  }

  if (attaching) {
    // The LinkedIn campaign already owns these; Zernio returns 400 on any.
    if (
      payload.budgetAmount !== undefined ||
      payload.budgetType ||
      payload.targeting ||
      payload.startDate ||
      payload.endDate ||
      bidding.costType ||
      bidding.unitCost != null
    ) {
      throw new Error(
        "Attaching a creative to a LinkedIn campaign inherits its budget, schedule, targeting and bidding — those must not be resent",
      );
    }
    return;
  }

  if (payload.budgetAmount === undefined || !payload.budgetType) {
    throw new Error("A LinkedIn campaign needs a budget");
  }
  const currency = adAccount.currency ?? "USD";
  if (payload.budgetType === "lifetime") {
    if (!payload.endDate) {
      throw new Error("LinkedIn lifetime budgets require endDate");
    }
    if (payload.budgetAmount < LINKEDIN_MIN_LIFETIME_BUDGET) {
      throw new Error(
        `LinkedIn lifetime budgets must be at least ${LINKEDIN_MIN_LIFETIME_BUDGET} ${currency}`,
      );
    }
  } else {
    const floor = Math.max(
      LINKEDIN_MIN_DAILY_BUDGET,
      adAccount.minimumDailyBudget ?? 0,
    );
    if (payload.budgetAmount < floor) {
      throw new Error(
        `LinkedIn daily budget must be at least ${floor} ${currency}`,
      );
    }
  }
}

async function createLinkedInAd(
  payload: CreateZernioStandaloneAdInput,
  options: {
    idempotencyKey: string;
    adAccount: { currency?: string; minimumDailyBudget?: number };
  },
) {
  assertLinkedInAdPayload(payload, options.adAccount);
  return createZernioStandaloneAd(payload, {
    idempotencyKey: options.idempotencyKey,
  });
}

export type CreateGoogleAdInput = {
  /** Stable cross-run dedupe key; see adWriteIdempotencyKey. */
  businessKey?: string | null;
  brandSlug: string;
  connectionAccountId: string;
  adAccountId: string;
  name: string;
  campaignType: "search" | "display";
  goal: "engagement" | "traffic" | "awareness" | "video_views";
  budgetAmount: number;
  budgetType: "daily" | "lifetime";
  headline: string;
  body: string;
  linkUrl: string;
  keywords?: string[];
  negativeKeywords?: string[];
  additionalHeadlines?: string[];
  additionalDescriptions?: string[];
  images?: { landscape: string; square: string };
  businessName?: string;
  targeting?: ZernioAdTargeting;
  startDate?: string;
  endDate?: string;
};

export async function createGoogleAd(
  input: CreateGoogleAdInput,
  context: AdsWriteContext,
) {
  const destination = await requireAdDestination({
    organizationId: context.organizationId,
    brandSlug: input.brandSlug,
    platform: "google",
    connectionAccountId: input.connectionAccountId,
    adAccountId: input.adAccountId,
  });
  if (input.budgetType === "lifetime" && !input.endDate) {
    throw new Error("Google lifetime budgets require endDate");
  }
  const creativeIssue = googleCreativeRequirement(input);
  if (creativeIssue) throw new Error(creativeIssue);
  if (
    input.budgetType === "daily" &&
    destination.adAccount.minimumDailyBudget !== undefined &&
    input.budgetAmount < destination.adAccount.minimumDailyBudget
  ) {
    throw new Error(
      `Google daily budget must be at least ${destination.adAccount.minimumDailyBudget} ${destination.adAccount.currency ?? "in the account currency"}`,
    );
  }

  const payload: CreateZernioStandaloneAdInput = {
    accountId: input.connectionAccountId,
    adAccountId: destination.adAccount.id,
    name: input.name,
    campaignType: input.campaignType,
    goal: input.goal,
    budgetAmount: input.budgetAmount,
    budgetType: input.budgetType,
    headline: input.headline,
    body: input.body,
    linkUrl: input.linkUrl,
    keywords: input.keywords,
    negativeKeywords: input.negativeKeywords,
    additionalHeadlines: input.additionalHeadlines,
    additionalDescriptions: input.additionalDescriptions,
    images: input.images,
    businessName: input.businessName,
    targeting: input.targeting,
    startDate: input.startDate,
    endDate: input.endDate,
  };
  const result = await createZernioStandaloneAd(payload, {
    idempotencyKey: idempotencyKey(
      context,
      "create-google",
      payload,
      input.businessKey,
    ),
  });
  // Google's create call takes no status, so the campaign can be delivering the
  // moment the provider accepts it. Pausing is a second, documented call.
  const pause = await pauseFreshGoogleCampaign(result.platformCampaignId);
  return {
    brand: destination.brand,
    connectionAccountId: input.connectionAccountId,
    adAccount: destination.adAccount,
    status: pause.status,
    warnings: pause.warnings,
    provider: result,
  };
}

export type BoostMetaPostInput = {
  /** Stable cross-run dedupe key; see adWriteIdempotencyKey. */
  businessKey?: string | null;
  brandSlug: string;
  connectionAccountId: string;
  adAccountId: string;
  name: string;
  goal:
    | "engagement"
    | "traffic"
    | "awareness"
    | "video_views"
    | "lead_generation"
    | "conversions"
    | "app_promotion";
  postId?: string;
  platformPostId?: string;
  budgetAmount: number;
  budgetType: "daily" | "lifetime";
  targeting?: ZernioAdTargeting;
  startDate?: string;
  endDate?: string;
};

export async function boostMetaPost(
  input: BoostMetaPostInput,
  context: AdsWriteContext,
) {
  const destination = await requireAdDestination({
    organizationId: context.organizationId,
    brandSlug: input.brandSlug,
    platform: "meta",
    connectionAccountId: input.connectionAccountId,
    adAccountId: input.adAccountId,
  });
  if (Boolean(input.postId) === Boolean(input.platformPostId)) {
    throw new Error("Provide exactly one of postId or platformPostId");
  }
  if (input.budgetType === "lifetime" && !input.endDate) {
    throw new Error("Meta lifetime budgets require endDate");
  }
  if (
    input.budgetType === "daily" &&
    destination.adAccount.minimumDailyBudget !== undefined &&
    input.budgetAmount < destination.adAccount.minimumDailyBudget
  ) {
    throw new Error(
      `Meta daily budget must be at least ${destination.adAccount.minimumDailyBudget} ${destination.adAccount.currency ?? "in the account currency"}`,
    );
  }
  const payload = {
    accountId: input.connectionAccountId,
    adAccountId: destination.adAccount.id,
    name: input.name,
    goal: input.goal,
    postId: input.postId,
    platformPostId: input.platformPostId,
    budget: { amount: input.budgetAmount, type: input.budgetType },
    schedule: { startDate: input.startDate, endDate: input.endDate },
    targeting: input.targeting,
  };
  const result = await boostZernioMetaPost(payload, {
    idempotencyKey: idempotencyKey(
      context,
      "boost-meta",
      payload,
      input.businessKey,
    ),
  });
  return {
    brand: destination.brand,
    connectionAccountId: input.connectionAccountId,
    adAccount: destination.adAccount,
    launchesActive: true as const,
    provider: result,
  };
}

export async function duplicateMetaCampaign(input: {
  organizationId: string;
  runId: string;
  brandSlug: string;
  platformCampaignId: string;
  renameSuffix?: string;
  /** Stable cross-run dedupe key; see adWriteIdempotencyKey. */
  businessKey?: string | null;
}) {
  const brand = await resolveOwnedBrand(input.organizationId, input.brandSlug);
  const [tree, allowed] = await Promise.all([
    getZernioAdsTree(),
    allowedAccountsForBrand(brand.id, "meta"),
  ]);
  const campaign = tree.find((candidate) => {
    const row = candidate as Record<string, unknown>;
    const candidateId =
      (typeof row.platformCampaignId === "string"
        ? row.platformCampaignId
        : null) ??
      candidate.id ??
      candidate._id;
    const accountId = row.platformAdAccountId;
    const platform = typeof row.platform === "string" ? row.platform : "";
    return (
      candidateId === input.platformCampaignId &&
      zernioConnectionMatchesPlatform("meta", platform) &&
      typeof accountId === "string" &&
      allowed.some((allowedAccount) =>
        sameAdAccountId("meta", allowedAccount.externalId, accountId),
      )
    );
  });
  if (!campaign) {
    throw new Error(
      `Meta campaign ${input.platformCampaignId} is outside ${brand.name}'s allowed accounts`,
    );
  }
  const provider = await duplicateZernioMetaCampaign(
    input.platformCampaignId,
    { renameSuffix: input.renameSuffix },
    {
      idempotencyKey: idempotencyKey(
        { organizationId: input.organizationId, runId: input.runId },
        "duplicate-meta",
        {
          platformCampaignId: input.platformCampaignId,
          renameSuffix: input.renameSuffix,
        },
        input.businessKey,
      ),
    },
  );
  return {
    brand,
    requestedStatus: "PAUSED" as const,
    provider,
  };
}

// ---- AUDIENCES -------------------------------------------------------------

export type CreateAdAudienceInput = {
  brandSlug: string;
  connectionAccountId: string;
  adAccountId: string;
  type: "customer_list" | "lookalike";
  name: string;
  description?: string;
  sourceAudienceId?: string;
  country?: string;
  ratio?: number;
  /**
   * The plan audience this platform asset fulfils. Stamping it is what keeps
   * "who we are buying" defined once and compiled per platform, rather than
   * the platform asset becoming its own orphan definition.
   */
  planAudienceId?: string;
  /**
   * The persona this asset is bought for. Stamping it supersedes the persona's
   * previous asset on the same platform, so campaigns built for the persona
   * move to this one.
   */
  personaId?: string;
};

/**
 * Create a Meta custom audience through the brand's allowlisted destination.
 * No spend, but a provider write — and Zernio's create endpoint is NOT
 * idempotent (no Idempotency-Key support), so a failure here must surface to
 * the operator instead of being retried.
 */
/**
 * Mirror the custom audiences that already exist in a brand's allowlisted ad
 * accounts into `audience` rows.
 *
 * Zernio has no first-party audience concept, so a client who spent two years
 * building lookalikes and website-visitor audiences has all of that sitting in
 * their ad account, invisible to us until we ask. Without this the audience
 * picker on a campaign can only offer audiences we created ourselves, which on
 * a new client is none.
 *
 * Read-only against the provider; writes only our own mirror rows.
 */
export async function syncBrandPlatformAudiences(input: {
  organizationId: string;
  brandSlug: string;
}) {
  const platforms: ZernioAdPlatform[] = [...ZERNIO_AD_PLATFORMS];
  let mirrored = 0;
  const errors: string[] = [];

  for (const platform of platforms) {
    const listed = await listAdsWriteDestinations({
      organizationId: input.organizationId,
      brandSlug: input.brandSlug,
      platform,
    }).catch((error: unknown) => {
      errors.push(
        `${platform}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    });
    if (!listed) continue;

    const channelPlatform = channelPlatformForZernioKey(platform);
    const channel = await db.query.channelTable.findFirst({
      where: and(
        eq(channelTable.brandId, listed.brand.id),
        eq(channelTable.platform, channelPlatform),
        isNull(channelTable.deletedAt),
      ),
      columns: { id: true },
    });
    if (!channel) continue;

    for (const destination of listed.destinations) {
      const remote = await listZernioAdAudiences({
        accountId: destination.connectionAccountId,
        adAccountId: destination.adAccountId,
      }).catch((error: unknown) => {
        errors.push(
          `${destination.adAccountId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return [];
      });

      for (const audience of remote) {
        const externalId =
          audience.platformAudienceId ?? audience.id ?? audience._id;
        if (!externalId || !audience.name) continue;
        const zernioId = audience.id ?? audience._id;
        const existing = await db.query.platformAudienceTable.findFirst({
          where: and(
            eq(platformAudienceTable.channelId, channel.id),
            or(
              eq(platformAudienceTable.externalId, externalId),
              // A row created in Growth before Meta returned its id.
              zernioId
                ? sql`${platformAudienceTable.definition}->>'id' = ${zernioId}`
                : undefined,
            ),
          ),
          columns: { id: true },
        });
        const values = {
          brandId: listed.brand.id,
          channelId: channel.id,
          name: audience.name,
          // Zernio's `type` is its own vocabulary; ours is coarser. Only
          // lookalike maps cleanly, everything else is a custom audience.
          type: (audience.type === "lookalike"
            ? "lookalike"
            : "custom") as AudienceType,
          source: (audience.type === "customer_list"
            ? "customer_list"
            : audience.type === "lookalike"
              ? "lookalike_seed"
              : "manual") as AudienceSource,
          externalId,
          sizeLabel:
            audience.approximateCount != null
              ? `~${audience.approximateCount.toLocaleString()}`
              : null,
          definition: audience as Record<string, unknown>,
        };
        if (existing) {
          await db
            .update(platformAudienceTable)
            .set(values)
            .where(eq(platformAudienceTable.id, existing.id));
        } else {
          await db.insert(platformAudienceTable).values(values);
        }
        mirrored++;
      }
    }
  }

  return { mirrored, errors };
}

/**
 * Keyword Planner for one brand's Google account.
 *
 * Read-only against Google: it creates nothing and spends nothing. Two jobs,
 * both of which the Google plan needs before a campaign is worth building.
 *
 * `ideas` mines the brand's own site plus any seed terms, which is what tells
 * you whether a given home has enough search volume to deserve its own ad
 * group rather than riding the brand campaign.
 *
 * `estimate` prices a set of terms. Owning a brand's own terms is the whole
 * point of the Google half, and the budget should be capped at what that
 * actually costs rather than a fixed share of the total — anything above the
 * cap buys nothing and is better spent on Meta.
 */
export async function researchGoogleKeywords(input: {
  organizationId: string;
  brandSlug: string;
  seedKeywords?: string[];
  seedUrl?: string;
  /** Price these exact terms instead of mining for new ones. */
  estimateKeywords?: string[];
  countries?: string[];
}) {
  const listed = await listAdsWriteDestinations({
    organizationId: input.organizationId,
    brandSlug: input.brandSlug,
    platform: "google",
  });
  const destination = listed.destinations[0];
  if (!destination) {
    throw new Error(
      "No allowlisted Google ad account for this brand. Connect one, then allow it on the brand page.",
    );
  }

  const shared = {
    accountId: destination.connectionAccountId,
    customerId: destination.adAccountId,
    countries: input.countries,
  };
  const [ideas, estimate] = await Promise.all([
    input.seedKeywords?.length || input.seedUrl
      ? generateZernioKeywordIdeas({
          ...shared,
          seedKeywords: input.seedKeywords,
          seedUrl: input.seedUrl,
          pageSize: 100,
        })
      : Promise.resolve([]),
    input.estimateKeywords?.length
      ? generateZernioKeywordHistoricalMetrics({
          ...shared,
          keywords: input.estimateKeywords,
          includeAverageCpc: true,
        })
      : Promise.resolve([]),
  ]);

  return {
    brand: listed.brand,
    adAccountId: destination.adAccountId,
    ideas,
    estimate,
    monthlyCost: estimateMonthlyKeywordCost(
      estimate.length > 0 ? estimate : ideas,
    ),
  };
}

/**
 * What it would cost per month to buy these terms.
 *
 * Searches are not clicks, so this is `searches × CTR × CPC` and the CTR is an
 * ASSUMPTION, stated rather than buried: brand terms at the top of the page
 * take a large share of clicks, and 35% is a conservative middle. The number
 * is a planning input for the Google budget cap, not a forecast.
 */
export const BRAND_TERM_CTR_ASSUMPTION = 0.35;

export function estimateMonthlyKeywordCost(
  rows: {
    avgMonthlySearches: number | null;
    averageCpc: number | null;
    highTopOfPageBid: number | null;
  }[],
  ctr = BRAND_TERM_CTR_ASSUMPTION,
) {
  let dollars = 0;
  let priced = 0;
  for (const row of rows) {
    const cpc = row.averageCpc ?? row.highTopOfPageBid;
    if (!row.avgMonthlySearches || !cpc) continue;
    dollars += row.avgMonthlySearches * ctr * cpc;
    priced += 1;
  }
  return {
    dollars: Math.round(dollars),
    priced,
    unpriced: rows.length - priced,
    ctrAssumption: ctr,
  };
}

/**
 * A persona has at most one asset per platform, the one its campaigns target.
 * Clearing the previous holder before stamping a new one keeps the push's
 * choice explicit instead of "whichever is newest".
 */
export async function clearPersonaAssetOnPlatform(
  personaId: string,
  platform: PushableAdPlatform,
) {
  const holders = await db
    .select({ id: platformAudienceTable.id })
    .from(platformAudienceTable)
    .innerJoin(
      channelTable,
      eq(channelTable.id, platformAudienceTable.channelId),
    )
    .where(
      and(
        eq(platformAudienceTable.personaId, personaId),
        eq(channelTable.platform, platform),
      ),
    );
  if (holders.length === 0) return;
  await db
    .update(platformAudienceTable)
    .set({ personaId: null })
    .where(
      inArray(
        platformAudienceTable.id,
        holders.map((row) => row.id),
      ),
    );
}

export async function createAdAudience(
  input: CreateAdAudienceInput,
  context: AdsWriteContext,
) {
  const destination = await requireAdDestination({
    organizationId: context.organizationId,
    brandSlug: input.brandSlug,
    platform: "meta",
    connectionAccountId: input.connectionAccountId,
    adAccountId: input.adAccountId,
  });
  if (
    input.type === "lookalike" &&
    (!input.sourceAudienceId || !input.country || !input.ratio)
  ) {
    throw new Error(
      "Lookalike audiences require sourceAudienceId, country, and ratio",
    );
  }
  if (input.ratio !== undefined && (input.ratio < 0.01 || input.ratio > 0.2)) {
    throw new Error("Lookalike ratio must be between 0.01 and 0.20");
  }
  if (input.planAudienceId) {
    const planAudience = await db.query.audienceTable.findFirst({
      where: eq(audienceTable.id, input.planAudienceId),
      columns: { brandId: true },
    });
    if (planAudience?.brandId !== destination.brand.id) {
      throw new Error("That audience belongs to a different brand");
    }
  }
  if (input.personaId) {
    const persona = await db.query.personaTable.findFirst({
      where: and(
        eq(personaTable.id, input.personaId),
        isNull(personaTable.deletedAt),
      ),
      columns: { brandId: true },
    });
    if (persona?.brandId !== destination.brand.id) {
      throw new Error("That persona belongs to a different brand");
    }
  }

  const provider = await createZernioAdAudience({
    accountId: input.connectionAccountId,
    adAccountId: destination.adAccount.id,
    type: input.type,
    name: input.name,
    description: input.description,
    sourceAudienceId: input.sourceAudienceId,
    country: input.country,
    ratio: input.ratio,
  });

  // Mirror the platform asset locally so it is visible on the brand's ads
  // page and linked to the first-party target it fulfils. Same shape as the
  // sync: externalId is the platform's id, definition is Zernio's record
  // (whose id the member upload needs).
  const audience = provider.audience;
  const externalId = audience?.platformAudienceId ?? null;
  const channel = await db.query.channelTable.findFirst({
    where: and(
      eq(channelTable.brandId, destination.brand.id),
      eq(channelTable.platform, "meta_ads"),
      isNull(channelTable.deletedAt),
    ),
    columns: { id: true },
  });
  let mirrored = null;
  if (channel) {
    if (input.personaId) {
      await clearPersonaAssetOnPlatform(input.personaId, "meta_ads");
    }
    [mirrored] = await db
      .insert(platformAudienceTable)
      .values({
        id: createId("paud"),
        channelId: channel.id,
        brandId: destination.brand.id,
        audienceId: input.planAudienceId ?? null,
        personaId: input.personaId ?? null,
        // A lookalike remembers its seed — that chain is platform-side.
        sourceId: input.sourceAudienceId ?? null,
        name: input.name,
        type: input.type === "lookalike" ? "lookalike" : "custom",
        source: input.type === "lookalike" ? "lookalike_seed" : "customer_list",
        externalId,
        definition: audience ?? null,
      })
      .returning();
  }

  return {
    brand: destination.brand,
    adAccount: destination.adAccount,
    platformAudienceId: mirrored?.id ?? null,
    planAudienceId: input.planAudienceId ?? null,
    provider,
  };
}

/**
 * Upload members to a customer_list audience in 10k chunks (Zernio's request
 * ceiling), sequentially so a mid-batch failure reports exactly how many rows
 * landed. Members are sent plaintext and hashed server-side by Zernio; never
 * log the rows themselves.
 */
export async function addAdAudienceUsers(input: {
  platformAudienceId: string;
  organizationId: string;
  users: ZernioAudienceUser[];
}) {
  const [row] = await db
    .select({
      definition: platformAudienceTable.definition,
      organizationId: brandTable.organizationId,
    })
    .from(platformAudienceTable)
    .innerJoin(brandTable, eq(brandTable.id, platformAudienceTable.brandId))
    .where(
      and(
        eq(platformAudienceTable.id, input.platformAudienceId),
        isNull(brandTable.deletedAt),
      ),
    )
    .limit(1);
  if (!row || row.organizationId !== input.organizationId) {
    throw new Error("Audience not found in this organization");
  }
  const record = (row.definition ?? {}) as Record<string, unknown>;
  const zernioId =
    typeof record.id === "string"
      ? record.id
      : typeof record._id === "string"
        ? record._id
        : null;
  // Audiences made directly in Meta are listed with no Zernio id, and the
  // upload endpoint only addresses Zernio's own records.
  if (!zernioId) {
    throw new Error(
      "This audience was not created through Zernio, so it cannot take member uploads here. Create a customer_list audience with createAudience and upload to that.",
    );
  }
  if (typeof record.type === "string" && record.type !== "customer_list") {
    throw new Error(
      `Only customer_list audiences take member uploads; this one is ${record.type}.`,
    );
  }
  const audienceId = zernioId;
  let uploaded = 0;
  try {
    for (
      let offset = 0;
      offset < input.users.length;
      offset += ZERNIO_AUDIENCE_USERS_MAX_PER_REQUEST
    ) {
      const chunk = input.users.slice(
        offset,
        offset + ZERNIO_AUDIENCE_USERS_MAX_PER_REQUEST,
      );
      await addUsersToZernioAdAudience(audienceId, chunk);
      uploaded += chunk.length;
    }
  } catch (error) {
    throw new Error(
      `Audience upload failed after ${uploaded}/${input.users.length} members: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    platformAudienceId: input.platformAudienceId,
    uploaded,
    total: input.users.length,
  };
}

/**
 * Pause a Google campaign that was just created.
 *
 * Meta's create call carries `status: PAUSED`; Google's does not, so the only
 * way to keep the promise the push dialog makes is a second, documented call.
 */
async function pauseFreshGoogleCampaign(
  platformCampaignId: string | null | undefined,
): Promise<{ status: PlatformCampaignStatus; warnings: string[] }> {
  if (!platformCampaignId) {
    return googlePauseOutcome({ paused: false, reason: "no-campaign-id" });
  }
  try {
    await setZernioCampaignStatus({
      platformCampaignId,
      status: "paused",
      platform: requireAdPlatformSpec("google_ads").zernio!.treePlatform,
    });
    return googlePauseOutcome({ paused: true });
  } catch (error) {
    return googlePauseOutcome({
      paused: false,
      reason: "pause-failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * What a fresh Google campaign is, once the follow-up pause has or has not
 * landed. Pure, because this is the rule worth pinning: growth never records
 * `paused` for a campaign it did not actually manage to pause.
 */
export function googlePauseOutcome(
  outcome:
    | { paused: true }
    | { paused: false; reason: "no-campaign-id" }
    | { paused: false; reason: "pause-failed"; message: string },
): { status: PlatformCampaignStatus; warnings: string[] } {
  if (outcome.paused) return { status: "paused", warnings: [] };
  return {
    status: "live",
    warnings: [
      outcome.reason === "no-campaign-id"
        ? "Google returned no campaign id, so the pause could not be sent — check the ad account before it spends"
        : `Created on Google, but pausing it failed (${outcome.message}) — pause it in Google Ads now`,
    ],
  };
}

// ---- PREVIEW -----------------------------------------------------------

/**
 * Pull every embeddable preview out of Meta's response, whatever nesting the
 * shape uses: any string containing an iframe yields its src. Pure, because
 * the response shape is the part most likely to drift.
 */
export function extractPreviewFrames(
  payload: unknown,
): Array<{ iframe: string; src: string | null }> {
  const found: Array<{ iframe: string; src: string | null }> = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      if (value.includes("<iframe")) {
        const src = /src="([^"]+)"/.exec(value)?.[1] ?? null;
        found.push({
          iframe: value,
          src: src ? src.replaceAll("&amp;", "&") : null,
        });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };
  walk(payload);
  return found;
}

/**
 * The Facebook page a Meta ads connection runs as, mined from the
 * connection's own identity: Zernio encodes it as "<user>:page:<pageId>" on
 * platformUserId. Derived, never stored — the connection is already fetched
 * wherever this is needed, so a stored copy could only go stale.
 */
export function metaPageIdFromConnection(
  platformUserId: string | null | undefined,
): string | null {
  const match = /:page:(\d+)/.exec(platformUserId ?? "");
  return match?.[1] ?? null;
}

/**
 * Render Meta's own previews for a DRAFTED ad, before anything exists.
 *
 * The creative spec is Meta's object_story_spec built from the plan ad. The
 * Facebook page id it runs as resolves from the connection itself; pass
 * pageId only to override. Image and carousel ads only in v1; video preview
 * needs an uploaded video id, which pre-create drafts do not have.
 */
export async function previewDraftAd(
  input: {
    adId: string;
    connectionAccountId: string;
    adAccountId: string;
    /** Override the page the ad runs as; resolved from the connection otherwise. */
    pageId?: string;
    formats?: string[];
  },
  context: AdsWriteContext,
) {
  const ad = await db.query.adTable.findFirst({
    where: eq(adTable.id, input.adId),
    with: { campaign: { columns: { landingUrl: true } } },
  });
  if (!ad) throw new Error("Ad not found");
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, ad.brandId),
    columns: { slug: true, organizationId: true },
  });
  if (brand?.organizationId !== context.organizationId || !brand.slug) {
    throw new Error("No access to this ad");
  }
  if (ad.type !== "creative") {
    throw new Error(
      "Preview covers creative ads; text ads render as Google formats only after push",
    );
  }
  const content = ad.content as AdCreativeContent;
  const previewIssue = metaPlacementMedia(content, "facebook-feed").issue;
  if (previewIssue) throw new Error(previewIssue);

  if (content.media[0]?.type === "video") {
    throw new Error(
      "Video preview needs an uploaded video id, which a pre-push draft does not have — push paused and preview from Ads Manager",
    );
  }
  const link = content.linkUrl ?? ad.campaign?.landingUrl;
  if (!link) {
    // Same rule as the push: a preview of a link the push would refuse is a
    // preview of an ad that cannot exist.
    throw new Error(
      "Set a landing URL on the campaign, or a link URL on the ad",
    );
  }
  const destination = await requireAdDestination({
    organizationId: context.organizationId,
    brandSlug: brand.slug,
    platform: "meta",
    connectionAccountId: input.connectionAccountId,
    adAccountId: input.adAccountId,
  });

  // The brand's own Page first: a destination that passed requireAdDestination
  // runs as it anyway, and a preview should show the ad the way it will run.
  const pageId =
    input.pageId ??
    destination.brand.metaPageId ??
    metaPageIdFromConnection(destination.connection.platformUserId);
  if (!pageId) {
    throw new Error(
      "Could not resolve the Facebook page from this connection — pass pageId explicitly",
    );
  }

  // Meta's documented story shapes: link_data for a static, link_data with
  // child_attachments for a carousel. Forwarded verbatim by Zernio.
  const linkData: Record<string, unknown> =
    content.media.length > 1
      ? {
          link,
          message: content.body,
          child_attachments: content.media.slice(0, 10).map((item) => ({
            link,
            picture: item.url,
            name: item.headline ?? content.headline,
            ...((item.description ?? content.description)
              ? { description: item.description ?? content.description }
              : {}),
            ...(content.callToAction
              ? {
                  call_to_action: {
                    type: metaCallToActionType(content.callToAction),
                    value: { link },
                  },
                }
              : {}),
          })),
        }
      : {
          link,
          message: content.body,
          name: content.headline,
          ...(content.description ? { description: content.description } : {}),
          picture: content.media[0]!.url,
          ...(content.callToAction
            ? {
                call_to_action: {
                  type: metaCallToActionType(content.callToAction),
                  value: { link },
                },
              }
            : {}),
        };

  const response = await generateZernioAdPreviews({
    accountId: input.connectionAccountId,
    adAccountId: destination.adAccount.id,
    // Feed formats render from a raw `picture` url, which is all a pre-push
    // draft has. Story and Reels formats need the image in the ad account's
    // library (an image_hash), so Meta answers those with "Image Not Found" —
    // a broken frame, not a useful preview. Story shape is covered by the
    // local preview instead; ask for those formats explicitly if you want
    // Meta's own attempt.
    formats: input.formats ?? ["DESKTOP_FEED_STANDARD", "MOBILE_FEED_STANDARD"],
    creativeSpec: {
      object_story_spec: {
        page_id: pageId,
        link_data: linkData,
      },
    },
  });
  const frames = extractPreviewFrames(response);
  return {
    adId: ad.id,
    adName: ad.name,
    formats: input.formats ?? ["DESKTOP_FEED_STANDARD", "MOBILE_FEED_STANDARD"],
    previews: frames,
    /** Open these directly; chat cannot embed the iframes. */
    previewUrls: frames.flatMap((frame) => (frame.src ? [frame.src] : [])),
  };
}

// ---- DELIVERY SWITCH -------------------------------------------------

/**
 * Pause or resume a synced campaign — the Launch button on the campaign
 * page. This is the moment money starts (or stops) moving, so it is only
 * reachable from an authenticated operator action; the click IS the
 * approval. Local status is updated only after the provider confirms.
 */
export async function setCampaignDelivery(
  input: { platformCampaignId: string; status: "active" | "paused" },
  context: AdsWriteContext,
) {
  const campaign = await db.query.platformCampaignTable.findFirst({
    where: eq(platformCampaignTable.id, input.platformCampaignId),
  });
  if (!campaign) throw new Error("Campaign not found");
  if (!campaign.brandId) throw new Error("Campaign has no brand");

  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, campaign.brandId),
    columns: { organizationId: true, name: true },
  });
  if (brand?.organizationId !== context.organizationId) {
    throw new Error("No access to this campaign");
  }
  if (!campaign.externalId) {
    throw new Error(
      "This campaign has no platform id yet — it was never synced or launched on the provider",
    );
  }
  // The status call is the one Zernio write that names the platform, in the
  // tree's vocabulary (facebook / google / linkedin).
  const platform = adPlatformSpec(campaign.platform)?.zernio?.treePlatform;
  if (!platform) {
    throw new Error(`Delivery toggle not supported for ${campaign.platform}`);
  }

  const provider = await setZernioCampaignStatus({
    platformCampaignId: campaign.externalId,
    status: input.status,
    platform,
  });

  const [updated] = await db
    .update(platformCampaignTable)
    .set({ status: input.status === "active" ? "live" : "paused" })
    .where(eq(platformCampaignTable.id, campaign.id))
    .returning({
      id: platformCampaignTable.id,
      status: platformCampaignTable.status,
    });

  return { campaign: updated, provider };
}

/**
 * The platform audience asset a plan audience should target, or null for
 * demographic-only targeting. Resolution is via lineage: a platform_audience
 * row pointing at the plan audience wins; failing that, the asset bought for
 * the persona the plan audience derives from. Either way it must live in an
 * ad account on this platform.
 */
async function platformAudienceExternalIdFor(
  planAudience: { id: string; personaId: string | null },
  brandId: string,
  platform: PushableAdPlatform,
): Promise<string | null> {
  const lineage = [
    eq(platformAudienceTable.audienceId, planAudience.id),
    ...(planAudience.personaId
      ? [eq(platformAudienceTable.personaId, planAudience.personaId)]
      : []),
  ];
  for (const link of lineage) {
    const rows = await db
      .select({ externalId: platformAudienceTable.externalId })
      .from(platformAudienceTable)
      .innerJoin(
        channelTable,
        eq(channelTable.id, platformAudienceTable.channelId),
      )
      .where(
        and(
          link,
          eq(platformAudienceTable.brandId, brandId),
          eq(channelTable.platform, platform),
          isNotNull(platformAudienceTable.externalId),
        ),
      )
      // Deterministic when several assets are linked: newest wins. The link
      // actions also unlink same-platform siblings, so this is the backstop.
      .orderBy(desc(platformAudienceTable.updatedAt))
      .limit(1);
    if (rows[0]?.externalId) return rows[0].externalId;
  }
  return null;
}

/**
 * Compile one plan audience into the targeting spec the platform accepts.
 *
 * Region names are the part that must not be guessed: the plan stores prose
 * ("California"), the platform wants opaque keys, and GET
 * /v1/ads/targeting/search is the documented bridge. A name that fails to
 * resolve is reported, never silently dropped — an unresolved region
 * silently widening to a whole country is the expensive failure mode.
 */
async function compileAudienceTargeting(input: {
  audience: PlanAudience;
  connectionAccountId: string;
  brandId: string;
  platform: PushableAdPlatform;
}): Promise<{ spec: ZernioAdTargeting | undefined; warnings: string[] }> {
  const { audience } = input;
  const warnings: string[] = [];
  const spec: ZernioAdTargeting = {};
  const platformSpec = requireAdPlatformSpec(input.platform);
  const canTarget = platformSpec.features.targeting;

  const geography = audience.geography ?? {};
  if (geography.countries?.length) spec.countries = geography.countries;
  if (audience.ageMin != null || audience.ageMax != null) {
    if (canTarget.age) {
      if (audience.ageMin != null) spec.ageMin = audience.ageMin;
      if (audience.ageMax != null) spec.ageMax = audience.ageMax;
    } else {
      warnings.push(
        `${audience.name}: ${platformSpec.shortLabel} takes no age targeting through Zernio — the age window was left out`,
      );
    }
  }

  // `states` holds codes and `regions` the names the geo search takes, so a
  // state that has no name in `regions` is named here rather than dropped. A
  // plan that carried only codes would otherwise compile to a country-wide
  // buy with nothing saying so.
  const namedStates = (geography.states ?? [])
    .map((code) => usStateName(code))
    .filter((name): name is string => name !== null);
  const regionNames = [
    ...new Set([
      ...(geography.regions ?? []),
      ...namedStates,
      // Cities ride the same resolution; Zernio's create takes them as region
      // keys of type city via the same search. Modeled coarsely until a real
      // city campaign needs radius targeting.
      ...(geography.cities ?? []),
    ]),
  ];
  for (const code of geography.states ?? []) {
    if (usStateName(code) === null) {
      warnings.push(
        `State code "${code}" is not one we can name, so it was left out of the location targeting`,
      );
    }
  }
  if (regionNames.length > 0 && !canTarget.regions) {
    // Country-level platforms: say what was dropped, and never let a plan
    // that named US states compile to a worldwide buy.
    warnings.push(
      `${audience.name}: ${platformSpec.shortLabel} targets at country level only through Zernio — ${regionNames.join(", ")} left out`,
    );
    if (!spec.countries?.length && namedStates.length > 0) {
      spec.countries = ["US"];
      warnings.push(
        `${audience.name}: no countries set, so US was inferred from the state codes`,
      );
    }
  } else if (regionNames.length > 0) {
    const resolved: Array<{ key: string }> = [];
    for (const name of regionNames) {
      try {
        const { results } = await searchZernioTargeting({
          accountId: input.connectionAccountId,
          q: name,
          dimension: "geo",
          geoType: "all",
          countryCode: geography.countries?.[0],
          limit: 5,
        });
        const match =
          results.find(
            (row) => row.name.toLowerCase() === name.toLowerCase(),
          ) ?? results[0];
        if (match) resolved.push({ key: match.id });
        else
          warnings.push(
            `"${name}" did not resolve to a targetable location on ${input.platform} — it was left out`,
          );
      } catch (error) {
        warnings.push(
          `Resolving "${name}" failed (${error instanceof Error ? error.message : String(error)}) — it was left out`,
        );
      }
    }
    if (resolved.length > 0) {
      spec.regions = resolved;
      // Countries scope lookup; including them in delivery conflicts with their states.
      if (input.platform === "meta_ads") delete spec.countries;
    }
    if (resolved.length === 0 && !spec.countries?.length) {
      warnings.push(
        `${audience.name}: no location resolved and no countries set — this targets WORLDWIDE`,
      );
    }
  }

  const assetId = await platformAudienceExternalIdFor(
    audience,
    input.brandId,
    input.platform,
  );
  if (assetId) spec.audienceId = assetId;

  const empty = Object.keys(spec).length === 0;
  if (empty) {
    warnings.push(
      `${audience.name}: no compilable targeting — this ad set runs broad`,
    );
  }
  return { spec: empty ? undefined : spec, warnings };
}

// ---- DRAFT → PLATFORM --------------------------------------------------

/**
 * Map the ads a create call returned back to the plan ads it was sent.
 *
 * Match by exact name, never reusing a response ad; fall back to pairing only
 * when both sides have exactly one. The fallback must not fire per-ad: with
 * one response and several plan ads, assigning that response to each of them
 * would stamp the same externalId on every row — which the unique index then
 * rejects AFTER the campaign already exists on the platform.
 */
export function matchResponseAdsToPlan(
  responseAds: Array<{
    name?: string;
    platformAdId?: unknown;
    id?: string;
    _id?: string;
  }>,
  planAds: Array<{ id: string; name: string }>,
): Map<string, string | null> {
  const used = new Set<number>();
  const externalIdOf = (row: (typeof responseAds)[number]) =>
    (typeof row.platformAdId === "string" ? row.platformAdId : null) ??
    row.id ??
    row._id ??
    null;
  const out = new Map<string, string | null>();
  for (const plan of planAds) {
    const index = responseAds.findIndex(
      (row, i) => !used.has(i) && row.name === plan.name,
    );
    const fallback =
      planAds.length === 1 && responseAds.length === 1 && !used.has(0) ? 0 : -1;
    const chosen = index >= 0 ? index : fallback;
    if (chosen >= 0) {
      used.add(chosen);
      out.set(plan.id, externalIdOf(responseAds[chosen]!));
    } else {
      out.set(plan.id, null);
    }
  }
  return out;
}

/** The plan's creative-type ads, shaped for Meta payload builders. */
function creativeAds(ads: Ad[]) {
  return ads.flatMap((ad) => {
    if (ad.type !== "creative") return [];
    const content = ad.content as AdCreativeContent;
    if (!content.media?.[0]?.url) return [];
    return [{ ad, content }];
  });
}

/** A creative whose lead medium is a video compiles to Meta's video shape. */
function isVideoContent(content: AdCreativeContent) {
  return content.media[0]?.type === "video";
}

/**
 * The `video` object Meta's create wants: the clip plus a still thumbnail.
 * The thumbnail comes from the media item; refusing here (by name) beats a
 * platform rejection after approval.
 */
export function videoPayloadFor(adName: string, content: AdCreativeContent) {
  const lead = content.media[0]!;
  // A poster-less clip used to arrive with its own url as the "thumbnail",
  // which passes a presence check and then fails at Meta. Treat that as absent.
  if (!lead.thumbnail || lead.thumbnail === lead.url) {
    throw new Error(
      `${adName}: a video ad needs a still thumbnail on its media item — Meta requires one alongside the clip`,
    );
  }
  return { url: lead.url, thumbnailUrl: lead.thumbnail };
}

function textAds(ads: Ad[]) {
  return ads.flatMap((ad) =>
    ad.type === "text" ? [{ ad, content: ad.content as AdTextContent }] : [],
  );
}

/** Explicit reviewed crops take precedence over the single creative fallback. */
export function googleDisplayImages(
  images: { landscape: string; square: string } | undefined,
  fallback: string | undefined,
) {
  if (images) return images;
  if (fallback) return { landscape: fallback, square: fallback };
  throw new Error("Google Display needs landscape and square images");
}

/**
 * Push the plan to one platform: COMPILE the campaign, its audiences and its
 * ads into that platform's shape, through the draft platform_campaign row —
 * which is where the authoritative budget and settings live, so the push
 * takes no numbers of its own. Meta creates paused. Google creates then
 * pauses; a failed pause returns the live status and an explicit warning.
 */
export async function pushDraftToPlatform(
  input: {
    campaignId: string;
    /**
     * Explicit, never inferred. This used to default to Meta, from when Meta
     * was the only platform — so an operator asking to push LinkedIn with the
     * field unset pushed META instead. It happened to be caught here by the
     * already-exists guard; on a campaign not yet on Meta it would have
     * created a second Meta campaign while the operator watched for LinkedIn.
     */
    platform: PushableAdPlatform;
    connectionAccountId: string;
    adAccountId: string;
    goal: AdPushGoal;
    validateOnly?: boolean;
  },
  context: AdsWriteContext,
) {
  const platform = input.platform;
  const platformSpec = requireAdPlatformSpec(platform);
  const platformName = platformSpec.shortLabel;
  if (!platformSpec.features.goals.includes(input.goal)) {
    throw new Error(
      `${platformName} does not offer the ${input.goal} goal through Zernio — pick one of ${platformSpec.features.goals.join(", ")}`,
    );
  }
  const campaign = await db.query.campaignTable.findFirst({
    where: eq(campaignTable.id, input.campaignId),
  });
  if (!campaign) throw new Error("Campaign not found");
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, campaign.brandId),
  });
  if (brand?.organizationId !== context.organizationId) {
    throw new Error("No access to this campaign");
  }
  if (!brand.slug) throw new Error("Brand has no slug");

  // The draft row is the contract: planned platform, authoritative budget,
  // per-platform settings. No draft, no push.
  const draft = await db.query.platformCampaignTable.findFirst({
    where: and(
      eq(platformCampaignTable.campaignId, campaign.id),
      eq(platformCampaignTable.platform, platform),
    ),
  });
  if (!draft) {
    throw new Error(
      `${platformName} is not planned for this campaign — plan it on the campaign page first`,
    );
  }
  if (draft.externalId) {
    throw new Error(
      `This campaign already exists on ${platformName} — edit it there, or draft a new campaign`,
    );
  }
  if (!draft.budget || draft.budget <= 0) {
    throw new Error(
      "Set the budget on the platform draft first — the push sends that number, not a guess",
    );
  }
  const budgetAmount = draft.budget;
  const budgetType = (draft.budgetType ?? "daily") as "daily" | "lifetime";
  const settings = draft.settings ?? {};

  const destination = await requireAdDestination({
    organizationId: context.organizationId,
    brandSlug: brand.slug,
    platform: zernioAdPlatformKey(platform),
    connectionAccountId: input.connectionAccountId,
    adAccountId: input.adAccountId,
  });

  const [audiences, ads] = await Promise.all([
    db.query.audienceTable.findMany({
      where: eq(audienceTable.campaignId, campaign.id),
    }),
    db.query.adTable.findMany({
      where: eq(adTable.campaignId, campaign.id),
    }),
  ]);
  if (ads.length === 0) {
    throw new Error("This campaign has no drafted ads — add ads first");
  }
  const unapproved = ads.filter(
    (ad) =>
      ad.status !== "approved" ||
      ("media" in ad.content &&
        ad.content.ideaStudio &&
        !ad.content.ideaStudio.approval),
  );
  if (unapproved.length)
    throw new Error(
      `Approve all ads before pushing: ${unapproved.map((ad) => ad.name).join(", ")}`,
    );
  const awaitingArtwork = ads.filter(
    (ad) =>
      "media" in ad.content &&
      ad.content.ideaStudio &&
      ideaAwaitingArtwork(ad.content.ideaStudio.document),
  );
  if (awaitingArtwork.length)
    throw new Error(
      `Artwork is still missing for an included size: ${awaitingArtwork.map((ad) => ad.name).join(", ")}. Add artwork, use the base image, or exclude that size before pushing.`,
    );
  // A shell is an ad someone meant to fill and did not. Sending the rest
  // around it would ship a set with a hole nobody chose.
  const shells = ads.filter(
    (ad) =>
      ad.type === "creative" &&
      ((ad.content as AdCreativeContent).media?.length ?? 0) === 0,
  );
  if (shells.length > 0) {
    throw new Error(
      `${shells.length} ad${shells.length === 1 ? " has" : "s have"} no creative yet: ${shells
        .map((ad) => ad.name)
        .join(", ")}. Add the cards or delete the shells before pushing.`,
    );
  }

  const schedule =
    platform === "meta_ads"
      ? resolveMetaSchedule({
          startAt: draft.startAt,
          endAt: draft.endAt,
          campaignStartAt: campaign.startAt,
          campaignEndAt: campaign.endAt,
          ...draft.settings?.meta,
        })
      : {
          startAt: draft.startAt ?? campaign.startAt,
          endAt: draft.endAt ?? campaign.endAt,
        };
  if (platform === "meta_ads") {
    const issue = metaScheduleIssue(schedule, budgetType);
    if (issue) throw new Error(issue);
  }
  const startDate = schedule.startAt?.toISOString();
  const endDate = schedule.endAt?.toISOString();
  if (budgetType === "lifetime" && !endDate) {
    throw new Error(
      "A lifetime budget needs an end date — set one on the campaign, or switch the draft to a daily budget",
    );
  }

  const warnings: string[] = [];

  // Compile every audience's targeting up front, so a resolution failure
  // surfaces before anything is created.
  const compiled = [];
  for (const audience of audiences) {
    const { spec, warnings: audienceWarnings } = await compileAudienceTargeting(
      {
        audience,
        connectionAccountId: input.connectionAccountId,
        brandId: brand.id,
        platform,
      },
    );
    warnings.push(...audienceWarnings);
    compiled.push({ audience, spec });
  }

  const pushArgs: PushArgs = {
    input,
    context,
    campaign,
    brand,
    draft,
    destination,
    compiled,
    ads,
    budgetAmount,
    budgetType,
    settings,
    startDate,
    endDate,
    warnings,
  };
  if (platform === "google_ads") return pushToGoogle(pushArgs);
  if (platform === "linkedin_ads") return pushToLinkedIn(pushArgs);
  return pushToMeta(pushArgs);
}

type PushArgs = {
  input: {
    campaignId: string;
    connectionAccountId: string;
    adAccountId: string;
    goal: AdPushGoal;
    validateOnly?: boolean;
  };
  context: AdsWriteContext;
  campaign: Campaign;
  brand: Brand;
  draft: PlatformCampaign;
  destination: AdDestination;
  compiled: Array<{
    audience: PlanAudience;
    spec: ZernioAdTargeting | undefined;
  }>;
  ads: Ad[];
  budgetAmount: number;
  budgetType: "daily" | "lifetime";
  settings: PlatformCampaignSettings;
  startDate?: string;
  endDate?: string;
  warnings: string[];
};

// ---- GOOGLE COMPILE ---------------------------------------------------
//
// Google's hierarchy is campaign → ad group, and the campaign TYPE decides
// everything (Search needs keywords, Display needs sized images). One call
// builds the whole tree; multi-ad-group is not modelled, so the first
// audience carries the targeting and the rest are reported, not dropped
// silently.
async function pushToGoogle(args: PushArgs) {
  const {
    input,
    context,
    campaign,
    brand,
    draft,
    destination,
    compiled,
    ads,
    budgetAmount,
    budgetType,
    settings,
    startDate,
    endDate,
    warnings,
  } = args;

  // Zernio's validate-only IS Meta's own execution_options; Google has no
  // equivalent, so a "dry run" here would build the campaign for real.
  if (input.validateOnly) {
    throw new Error(
      "Google has no dry run — Zernio's validate-only is Meta's own. Review the draft, then push for real",
    );
  }
  const google = settings.google ?? {};
  const campaignType = google.campaignType;
  if (!campaignType) {
    throw new Error(
      "Set the Google campaign type (search or display) on the platform draft first",
    );
  }
  if (input.goal === "conversions") {
    throw new Error(
      "Google push supports traffic, engagement, awareness, and video_views",
    );
  }

  // Keywords: the operator's structured override wins; otherwise derive from
  // the audiences' suggestions — that is the whole point of the loose field.
  const keywords = google.keywords ?? [
    ...new Set(compiled.flatMap(({ audience }) => audience.keywords ?? [])),
  ];
  if (campaignType === "search" && keywords.length === 0) {
    throw new Error(
      "A Google Search campaign needs keywords — add suggestions on an audience, or set them on the Google draft",
    );
  }

  const text = textAds(ads)[0];
  // Google Display renders images; a video creative must never be the source
  // of its landscape/square urls.
  const creative = creativeAds(ads).find(
    ({ content }) => !isVideoContent(content),
  );
  if (!text && !creative) {
    throw new Error(
      "No usable ad: add a text ad (headlines + descriptions), or a creative ad with an image",
    );
  }
  const headline =
    text?.content.headlines[0] ?? creative?.content.headline ?? campaign.name;
  const body =
    text?.content.descriptions[0] ??
    creative?.content.body ??
    campaign.description ??
    campaign.name;
  const linkUrl =
    text?.content.linkUrl ??
    creative?.content.linkUrl ??
    campaign.landingUrl ??
    null;
  if (!linkUrl) {
    throw new Error(
      "Set a landing URL on the campaign, or a link URL on an ad",
    );
  }
  if (campaignType === "display" && !creative && !google.images) {
    throw new Error("A Google Display campaign needs a creative ad's image");
  }

  const first = compiled[0];
  if (compiled.length > 1) {
    warnings.push(
      `Google push compiles ONE audience (${first!.audience.name}); the other ${compiled.length - 1} were not sent — multi-ad-group is not modelled yet`,
    );
  }

  const result = await createGoogleAd(
    {
      businessKey: `push:${campaign.id}:google`,
      brandSlug: brand.slug!,
      connectionAccountId: input.connectionAccountId,
      adAccountId: destination.adAccount.id,
      name: campaign.name,
      campaignType,
      goal: input.goal,
      budgetAmount,
      budgetType,
      headline,
      body,
      linkUrl,
      keywords,
      negativeKeywords: google.negativeKeywords,
      additionalHeadlines:
        google.additionalHeadlines ?? text?.content.headlines.slice(1),
      additionalDescriptions:
        google.additionalDescriptions ?? text?.content.descriptions.slice(1),
      businessName: google.businessName ?? brand.name,
      targeting: first?.spec,
      startDate,
      endDate,
      images:
        campaignType === "display"
          ? googleDisplayImages(google.images, creative?.content.media[0]?.url)
          : undefined,
    },
    context,
  );
  warnings.push(...(result.warnings ?? []));

  const provider = result.provider;
  await recordCompiledCampaign({
    adAccountId: destination.adAccount.id,
    draft,
    campaign,
    status: result.status,
    budgetAmount,
    budgetType,
    externalCampaignId: writtenCampaignId(provider),
    heroThumbnailUrl: creative?.content.media[0]?.url ?? null,
    sets: [
      {
        audience: first?.audience ?? null,
        name: first?.audience.name ?? campaign.name,
        externalId: writtenAdSetId(provider),
        targetingSpec: first?.spec ?? null,
        budget: budgetAmount,
        budgetType,
        ads: [
          {
            planAd: (text ?? creative)!.ad,
            externalId: null,
            headline,
            body,
            linkUrl,
            media: creative ? creative.content.media : null,
          },
        ],
      },
    ],
  });

  return {
    campaignId: campaign.id,
    platform: "google_ads" as const,
    validateOnly: false,
    platformCampaignRowId: draft.id,
    adSetsCreated: 1,
    adsCreated: 1,
    path: `/app/brands/${brand.slug}/ads/platform/${draft.id}`,
    warnings,
    provider,
  };
}

/**
 * What a Meta ad set optimises toward.
 *
 * Wander's pixel is on wander.com and every WanderOS storefront, so a client
 * ad set pointed at the raw Purchase event is credited with any booking in the
 * fleet a viewer makes within the attribution window. Winter Park Escapes'
 * first campaign reported nine purchases against two on its own host that
 * way. A client brand with a website therefore gets a Custom Conversion
 * scoped to its host, provisioned through Zernio (which reuses by name) and
 * pinned on the ad set on its own: Meta rejects a pixel sent alongside it.
 * It has to be right here: Meta will not let the conversion of a published
 * ad set be edited afterwards (subcode 3260011). Wander's own brands keep the raw event, and an
 * explicit `customConversionId` in the settings always wins.
 */
export function metaPromotedObjectFor(args: {
  brand: Pick<Brand, "name" | "relationship">;
  meta: {
    pixelId?: string;
    customEventType?: string;
    customConversionId?: string;
    conversionScope?: "host" | "pixel";
  };
  /** The brand's site-scoped custom conversion on this ad account, if made. */
  reporting?: { customConversionId: string; host: string };
  /** The brand's website host today; a conversion made for another is stale. */
  host?: string | null;
}): CreateZernioStandaloneAdInput["promotedObject"] {
  const { brand, meta } = args;
  if (meta.customConversionId) {
    return { customConversionId: meta.customConversionId };
  }
  if (!meta.pixelId && !meta.customEventType) return undefined;
  if (brand.relationship === "client" && meta.conversionScope === "host") {
    if (!args.reporting) {
      throw new Error(
        `${brand.name} has no reporting conversion on this ad account. Create it on the brand's Ads page, or optimise on the shared pixel event.`,
      );
    }
    if (args.host && args.reporting.host !== args.host) {
      throw new Error(
        `${brand.name}'s reporting conversion is scoped to ${args.reporting.host}, but the website is now ${args.host}. Recreate it on the brand's Ads page.`,
      );
    }
    return { customConversionId: args.reporting.customConversionId };
  }
  return { pixelId: meta.pixelId, customEventType: meta.customEventType };
}

/**
 * The client's own bookings, apart from the fleet's: a custom conversion on
 * the paying account's pixel, scoped to the brand's website. Made on demand
 * from the brand's Ads page, once, because it only counts events from its
 * creation on. Reuses a matching one already on the ad account.
 */
export async function ensureBrandReportingConversion(
  input: {
    brandSlug: string;
    connectionAccountId: string;
    adAccountId: string;
  },
  context: { organizationId: string },
) {
  const destination = await requireAdDestination({
    organizationId: context.organizationId,
    brandSlug: input.brandSlug,
    platform: "meta",
    connectionAccountId: input.connectionAccountId,
    adAccountId: input.adAccountId,
  });
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, destination.brand.id),
    columns: { id: true, name: true, relationship: true, website: true },
  });
  if (brand?.relationship !== "client") {
    throw new Error("Reporting conversions are for Performance clients.");
  }
  const host = normalizeDomain(brand.website);
  if (!host) throw new Error(`Set ${brand.name}'s website first.`);
  const tracking = await metaTrackingDefaults(
    brand.id,
    destination.adAccount.id,
  );
  if (!tracking) {
    throw new Error(
      "Set the default conversion tracking for this ad account first.",
    );
  }
  const conversion = {
    name: performanceConversionName({
      customer: brand.name,
      isClient: true,
      event: tracking.customEventType,
    }),
    pixelId: tracking.pixelId,
    customEventType: tracking.customEventType,
    rule: hostScopedConversionRule(host, tracking.customEventType),
  };
  const existing = await listZernioCustomConversions({
    accountId: input.connectionAccountId,
    adAccountId: destination.adAccount.id,
  });
  const listed = reusableCustomConversion(existing, conversion);
  const { customConversionId, reused } = listed
    ? { customConversionId: listed, reused: true }
    : await createZernioCustomConversion({
        accountId: input.connectionAccountId,
        adAccountId: destination.adAccount.id,
        ...conversion,
      });
  const saved = {
    customConversionId,
    name: conversion.name,
    host,
    pixelId: conversion.pixelId,
    customEventType: conversion.customEventType,
  };
  await db
    .update(brandTable)
    .set({
      performanceSettings: sql`jsonb_set(coalesce(${brandTable.performanceSettings}, '{}'::jsonb), '{metaReportingConversions}', coalesce(${brandTable.performanceSettings}->'metaReportingConversions', '{}'::jsonb) || ${JSON.stringify({ [destination.adAccount.id]: saved })}::jsonb)`,
    })
    .where(eq(brandTable.id, brand.id));
  return { ...saved, adAccountId: destination.adAccount.id, reused };
}

// ---- META COMPILE ------------------------------------------------------
//
// Each plan audience becomes an ad set; every creative ad runs under every
// ad set. One audience (or none) is a single create; several use the
// shell-then-attach shape with rollback so nothing is left half-built.
/** A campaign budget must belong to an explicit shell, even for one audience. */
export function metaRequiresCampaignShell(
  audienceCount: number,
  useCbo: boolean,
) {
  return useCbo || audienceCount > 1;
}

async function pushToMeta(args: PushArgs) {
  const {
    input,
    context,
    campaign,
    brand,
    draft,
    destination,
    compiled,
    ads,
    budgetAmount,
    budgetType,
    settings,
    startDate,
    endDate,
    warnings,
  } = args;

  const usable = creativeAds(ads);
  if (usable.length === 0) {
    throw new Error(
      "Meta needs at least one creative ad with an image — text ads compile to Google only",
    );
  }
  const skippedText = textAds(ads).length;
  if (skippedText > 0) {
    warnings.push(
      `${skippedText} text ad(s) were not sent to Meta — they compile to Google`,
    );
  }
  const linkUrl =
    usable.find(({ content }) => content.linkUrl)?.content.linkUrl ??
    campaign.landingUrl;
  if (!linkUrl) {
    throw new Error(
      "Set a landing URL on the campaign, or a link URL on at least one ad",
    );
  }

  const meta = applyMetaTrackingDefaults(
    settings.meta ?? {},
    await metaTrackingDefaults(brand.id, destination.adAccount.id),
  );
  const planned = metaPlacementPlanSchema.safeParse(
    meta.placements ?? META_DEFAULT_PLACEMENTS,
  );
  if (!planned.success)
    throw new Error("Choose delivery placements in Meta setup before pushing.");
  const placementPlan = planned.data;
  if (meta.importSource?.issues.length && !meta.importReviewed)
    throw new Error(
      "Resolve imported delivery settings before pushing: " +
        meta.importSource.issues.join(" "),
    );
  for (const { ad, content } of usable) {
    for (const placement of placementPlan) {
      const issue = metaPlacementMedia(content, placement).issue;
      if (issue) throw new Error(`${ad.name}: ${issue}`);
    }
  }
  const useCbo = (meta.budgetMode ?? "cbo") === "cbo";
  const promotedObject = metaPromotedObjectFor({
    brand,
    meta,
    reporting:
      brand.performanceSettings?.metaReportingConversions?.[
        destination.adAccount.id
      ],
    host: normalizeDomain(brand.website),
  });

  const isCarousel = (content: AdCreativeContent) =>
    !isVideoContent(content) && (content.media?.length ?? 0) >= 2;

  // Zernio rejects a Meta ad with no call to action, on every shape. A
  // Performance client's ads always book; a stored LEARN_MORE is overridden.
  const isClient = brand.relationship === "client";
  const overriddenCta = usable.filter(
    ({ content }) =>
      isClient &&
      content.callToAction &&
      content.callToAction !== META_DEFAULT_CALL_TO_ACTION,
  );
  if (overriddenCta.length > 0) {
    warnings.push(
      `${overriddenCta.length} ad(s) had a call to action other than ${META_DEFAULT_CALL_TO_ACTION}; client ads push with ${META_DEFAULT_CALL_TO_ACTION}`,
    );
  }
  const metaCallToAction = (content: AdCreativeContent) =>
    metaCallToActionType(
      isClient
        ? META_DEFAULT_CALL_TO_ACTION
        : (content.callToAction ?? META_DEFAULT_CALL_TO_ACTION),
    );

  // House naming at every level. A campaign, ad set or ad already in the
  // convention keeps its name; anything else is renamed on the way out.
  const metaCampaignName = campaign.name.startsWith("META_")
    ? campaign.name
    : performanceCampaignName({ customer: brand.name, isClient });
  const adSetNameFor = (audience: PlanAudience | null) =>
    performanceAdSetName({
      customer: brand.name,
      isClient,
      audience: audienceLabelForPlan(audience),
      states: audience?.geography?.states ?? null,
    });
  const adNameFor = (ad: Ad, content: AdCreativeContent) =>
    ad.name.startsWith("META_")
      ? ad.name
      : performanceAdName({
          customer: brand.name,
          isClient,
          format: adFormatFor(content),
          propertyName: content.propertyName ?? ad.name,
        });

  const carouselCardsFor = (content: AdCreativeContent) =>
    content.media.slice(0, 10).map((item, index) => ({
      imageUrl: item.url,
      // A card's own words win; blank inherits the ad's, as on every
      // platform that only knows one headline.
      headline:
        item.headline ??
        (index === 0 ? content.headline : (content.headline ?? campaign.name)),
      description: item.description ?? content.description,
      linkUrl: content.linkUrl ?? linkUrl,
      callToAction: metaCallToAction(content),
    }));

  const creativesFor = (subset: typeof usable) =>
    subset.map(({ ad, content }) => ({
      name: adNameFor(ad, content),
      // Every creative carries its own headline and body in the
      // multi-creative shape; Meta does not fall back per creative.
      headline: content.headline,
      body: content.body,
      description: content.description,
      ...(isVideoContent(content)
        ? { video: videoPayloadFor(ad.name, content) }
        : { imageUrl: content.media[0]!.url }),
      linkUrl: content.linkUrl ?? linkUrl,
      callToAction: metaCallToAction(content),
    }));

  /**
   * One ad, two files: the baseline for every placement, the 9:16 pinned to
   * stories and reels. Meta's asset customization, which is how Brooke builds
   * it by hand. Statics only; a carousel's cards are the carousel's.
   */
  const placementAssetsFor = (
    content: AdCreativeContent,
  ): ZernioPlacementAssets | undefined => {
    const card = content.media[0];
    if (!card || content.media.length !== 1 || card.type === "video") {
      return undefined;
    }
    if (!card.story || !placementPlan.some((p) => !isFeedPlacement(p)))
      return undefined;
    return {
      defaultImageUrl: card.url,
      rules: [
        {
          imageUrl: card.story.url,
          placements: {
            ...metaProviderPlacements(
              placementPlan.filter((p) => !isFeedPlacement(p)),
            ),
          },
        },
      ],
    };
  };

  /**
   * How a set's ads split across Meta's create shapes. The multi-creative
   * shape takes N plain statics in one call but carries no per-placement
   * assets, so a static with a story rides the single-creative or attach
   * shape like a carousel does. The opening call takes the plain statics,
   * else the first placed static, else the first carousel; everything else
   * is attached one call at a time.
   */
  const splitForPush = (subset: typeof usable) => {
    const carousels = subset.filter(({ content }) => isCarousel(content));
    const statics = subset.filter(({ content }) => !isCarousel(content));
    // The opening create supports pageId; attaching a standalone carousel does not.
    // Start with the lone carousel so all trailing statics stay in this same ad set.
    if (
      brand.metaPageId &&
      !connectionRunsAsBrandPage(brand, destination.connection) &&
      carousels.length === 1
    ) {
      return {
        shape: "carousel" as const,
        opening: carousels,
        trailing: statics,
      };
    }

    const placed = statics.filter(({ content }) =>
      Boolean(placementAssetsFor(content)),
    );
    const plain = statics.filter((row) => !placed.includes(row));
    if (plain.length > 0) {
      return {
        shape: "creatives" as const,
        opening: plain,
        trailing: [...placed, ...carousels],
      };
    }
    if (placed.length > 0) {
      return {
        shape: "single" as const,
        opening: placed.slice(0, 1),
        trailing: [...placed.slice(1), ...carousels],
      };
    }
    return {
      shape: "carousel" as const,
      opening: carousels.slice(0, 1),
      trailing: carousels.slice(1),
    };
  };

  /** One ad set as the API sees it. */
  const adSetPayload = (setArgs: {
    audience: PlanAudience | null;
    spec: ZernioAdTargeting | undefined;
    existingCampaignId?: string;
    validateOnly: boolean;
  }): CreateZernioStandaloneAdInput => ({
    accountId: input.connectionAccountId,
    adAccountId: destination.adAccount.id,
    ...(setArgs.existingCampaignId
      ? { existingCampaignId: setArgs.existingCampaignId }
      : { campaignName: metaCampaignName }),
    name: setArgs.existingCampaignId
      ? adSetNameFor(setArgs.audience)
      : metaCampaignName,
    adSetName: adSetNameFor(setArgs.audience),
    goal: input.goal,
    // Under CBO the campaign owns the money; an ad set that also sends a
    // budget is fighting the thing that makes CBO worth using.
    ...(useCbo && setArgs.existingCampaignId
      ? {}
      : { budgetAmount, budgetType }),
    headline: usable[0]!.content.headline,
    body: usable[0]!.content.body,
    linkUrl,
    callToAction: metaCallToAction(usable[0]!.content),
    creatives: creativesFor(usable),
    targeting: setArgs.spec,
    placements: metaProviderPlacements(placementPlan),
    startDate,
    endDate,
    promotedObject,
    ...metaDraftProviderControls(setArgs.validateOnly),
  });

  /**
   * Create one ad set and everything inside it. Meta's create takes ONE
   * creative shape per call: N statics via creatives[], or one carousel via
   * carouselCards — a mix needs the attach shape for the leftovers, and a
   * failed attach rolls the campaign back rather than stranding it.
   */
  const createAdSetWithAds = async (setArgs: {
    audience: PlanAudience | null;
    spec: ZernioAdTargeting | undefined;
    existingCampaignId?: string;
    validateOnly: boolean;
    keyScope: string;
  }) => {
    const { shape, opening, trailing } = splitForPush(usable);
    const lead = opening[0]!;
    const payload: CreateZernioStandaloneAdInput = {
      ...adSetPayload(setArgs),
      ...(shape === "creatives"
        ? { creatives: creativesFor(opening) }
        : {
            // A single-creative opening: the set's words are this ad's words.
            creatives: undefined,
            adName: adNameFor(lead.ad, lead.content),
            headline: lead.content.headline,
            body: lead.content.body,
            description: lead.content.description,
            linkUrl: lead.content.linkUrl ?? linkUrl,
            callToAction: metaCallToAction(lead.content),
            ...(shape === "carousel"
              ? { carouselCards: carouselCardsFor(lead.content) }
              : {
                  imageUrl: lead.content.media[0]!.url,
                  placementAssets: placementAssetsFor(lead.content),
                }),
          }),
    };
    const result = await createMetaAd(payload, {
      pageId:
        destination.brand.metaPageId ??
        metaPageIdFromConnection(destination.connection.platformUserId),
      idempotencyKey: idempotencyKey(
        context,
        `push-adset:${setArgs.keyScope}`,
        payload,
      ),
      adAccount: destination.adAccount,
    });

    if (setArgs.validateOnly || result.validateOnly) {
      return {
        result,
        attached: [] as Array<{ planAd: Ad; result: ZernioAdWriteResponse }>,
      };
    }

    const rollbackCampaignId = setArgs.existingCampaignId
      ? null
      : writtenCampaignId(result);
    const attached: Array<{ planAd: Ad; result: ZernioAdWriteResponse }> = [];
    try {
      for (const { ad, content } of trailing) {
        const attachPayload: CreateZernioStandaloneAdInput = {
          accountId: input.connectionAccountId,
          adAccountId: destination.adAccount.id,
          adSetId: writtenAdSetId(result)!,
          name: adNameFor(ad, content),
          goal: input.goal,
          headline: content.headline,
          body: content.body,
          description: content.description,
          linkUrl: content.linkUrl ?? linkUrl,
          callToAction: metaCallToAction(content),
          ...(isCarousel(content)
            ? { carouselCards: carouselCardsFor(content) }
            : {
                imageUrl: content.media[0]!.url,
                placementAssets: placementAssetsFor(content),
              }),
          ...metaDraftProviderControls(false),
        };
        attached.push({
          planAd: ad,
          result: await createMetaAd(attachPayload, {
            pageId:
              destination.brand.metaPageId ??
              metaPageIdFromConnection(destination.connection.platformUserId),
            idempotencyKey: idempotencyKey(
              context,
              `push-attach:${setArgs.keyScope}:${ad.id}`,
              attachPayload,
            ),
            adAccount: destination.adAccount,
            carouselSeedBudget:
              brand.metaPageId &&
              !connectionRunsAsBrandPage(brand, destination.connection)
                ? budgetAmount
                : undefined,
          }),
        });
      }
    } catch (error) {
      if (rollbackCampaignId) {
        await deleteZernioCampaign({
          campaignId: rollbackCampaignId,
          accountId: input.connectionAccountId,
        }).catch((cleanupError) => {
          console.error(
            "attach rollback failed",
            rollbackCampaignId,
            cleanupError,
          );
        });
      }
      throw new Error(
        `Push failed while attaching ad ${attached.length + 1} of ${trailing.length}${
          rollbackCampaignId
            ? " — the campaign was removed from Meta so nothing is half-built"
            : ""
        }. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { result, attached };
  };

  /**
   * Map Meta's returned ads back to plan ads for lineage. The opening call
   * carries the statics (or the lone leading carousel); the attach results
   * are exact per plan ad. The two sets are disjoint by construction.
   */
  const setAdsFor = (
    set: {
      result: ZernioAdWriteResponse;
      attached: Array<{ planAd: Ad; result: ZernioAdWriteResponse }>;
    },
    subset: typeof usable,
  ) => {
    const { opening } = splitForPush(subset);
    const responseAds =
      set.result.ads ?? (set.result.ad ? [set.result.ad] : []);
    const byPlanId = matchResponseAdsToPlan(
      responseAds,
      opening.map(({ ad }) => ({ id: ad.id, name: ad.name })),
    );
    const fromOpening = opening.map(({ ad, content }) => ({
      planAd: ad,
      externalId: byPlanId.get(ad.id) ?? null,
      headline: content.headline,
      body: content.body,
      linkUrl: content.linkUrl ?? linkUrl,
      media: content.media,
    }));
    const fromAttach = set.attached.map(({ planAd, result }) => {
      const row = result.ad ?? result.ads?.[0];
      const content = planAd.content as AdCreativeContent;
      return {
        planAd,
        externalId:
          (typeof row?.platformAdId === "string" ? row.platformAdId : null) ??
          row?.id ??
          row?._id ??
          null,
        headline: content.headline,
        body: content.body,
        linkUrl: content.linkUrl ?? linkUrl,
        media: content.media,
      };
    });
    return [...fromOpening, ...fromAttach];
  };

  // ---- one (or no) audience: a single create --------------------------
  if (
    compiled.length <= 1 &&
    (!metaRequiresCampaignShell(compiled.length, useCbo) || input.validateOnly)
  ) {
    const only = compiled[0] ?? null;
    const set = await createAdSetWithAds({
      audience: only?.audience ?? null,
      spec: only?.spec,
      validateOnly: input.validateOnly ?? false,
      keyScope: `push:${campaign.id}:meta`,
    });
    if (input.validateOnly || set.result.validateOnly) {
      return {
        campaignId: campaign.id,
        platform: "meta_ads" as const,
        validateOnly: true,
        adsCreated: 0,
        warnings,
        provider: set.result,
      };
    }
    await recordCompiledCampaign({
      adAccountId: destination.adAccount.id,
      draft,
      campaign,
      status: "paused",
      budgetAmount,
      budgetType,
      externalCampaignId: writtenCampaignId(set.result),
      heroThumbnailUrl: usable[0]!.content.media[0]?.url ?? null,
      sets: [
        {
          audience: only?.audience ?? null,
          name: only?.audience.name ?? campaign.name,
          externalId: writtenAdSetId(set.result),
          targetingSpec: only?.spec ?? null,
          budget: budgetAmount,
          budgetType,
          ads: setAdsFor(set, usable),
        },
      ],
    });
    return {
      campaignId: campaign.id,
      platform: "meta_ads" as const,
      validateOnly: false,
      platformCampaignRowId: draft.id,
      adSetsCreated: 1,
      adsCreated: usable.length,
      path: `/app/brands/${brand.slug}/ads/platform/${draft.id}`,
      warnings,
    };
  }

  // CBO needs an explicit budget-owning shell, even with one audience.
  if (input.validateOnly) {
    throw new Error(
      "Dry run covers single-audience pushes only; Meta has no dry run for the two-step shape",
    );
  }
  const shell = await createZernioAdCampaign(
    {
      accountId: input.connectionAccountId,
      adAccountId: destination.adAccount.id,
      name: metaCampaignName,
      goal: input.goal,
      ...(useCbo ? { budgetAmount, budgetType } : {}),
      status: "PAUSED",
    },
    {
      idempotencyKey: idempotencyKey(
        context,
        "push-shell",
        { campaignId: campaign.id },
        // The draft's edit time is in the key: a replayed shell carries the old
        // budget, or a campaign deleted after a failed push.
        `shell:${campaign.id}:meta:${draft.updatedAt.getTime()}`,
      ),
    },
  );
  const shellId =
    shell.campaignId ??
    shell.campaign?.platformCampaignId ??
    shell.campaign?.id ??
    null;
  if (!shellId) throw new Error("Zernio returned no campaign id for the shell");

  const perSet = [];
  // If any audience fails, the shell is a campaign with no ads: invisible to
  // the tree and impossible to clean up by hand. Delete it rather than
  // stranding it, and surface which audience failed.
  try {
    for (const { audience, spec } of compiled.length
      ? compiled
      : [{ audience: null, spec: undefined }]) {
      const set = await createAdSetWithAds({
        audience,
        spec,
        existingCampaignId: shellId,
        validateOnly: false,
        keyScope: `push:${campaign.id}:${audience?.id ?? "broad"}`,
      });
      perSet.push({ audience, spec, set });
    }
  } catch (error) {
    await deleteZernioCampaign({
      campaignId: shellId,
      accountId: input.connectionAccountId,
    }).catch((cleanupError) => {
      console.error("push rollback failed", shellId, cleanupError);
    });
    await retireShellKey(draft.id);
    throw new Error(
      `Push failed after ${perSet.length} of ${compiled.length} audiences — the campaign was removed from Meta so nothing is half-built. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  await recordCompiledCampaign({
    adAccountId: destination.adAccount.id,
    draft,
    campaign,
    status: "paused",
    budgetAmount,
    budgetType,
    externalCampaignId: shellId,
    heroThumbnailUrl: usable[0]!.content.media[0]?.url ?? null,
    sets: perSet.map(({ audience, spec, set }) => ({
      audience,
      name: audience?.name ?? campaign.name,
      externalId: writtenAdSetId(set.result),
      targetingSpec: spec ?? null,
      budget: useCbo ? null : budgetAmount,
      budgetType,
      ads: setAdsFor(set, usable),
    })),
  });

  return {
    campaignId: campaign.id,
    platform: "meta_ads" as const,
    validateOnly: false,
    platformCampaignRowId: draft.id,
    adSetsCreated: perSet.length,
    adsCreated: perSet.length * usable.length,
    path: `/app/brands/${brand.slug}/ads/platform/${draft.id}`,
    warnings,
  };
}

// ---- LINKEDIN COMPILE ---------------------------------------------------
//
// LinkedIn's pyramid is campaign group → campaign → creative, and Zernio lays
// it on the shared shape: the group is our platform_campaign, the campaign
// (which owns budget, bid, schedule and targeting) is our ad set, the
// creative is our ad. Each plan audience becomes a LinkedIn campaign and every
// creative ad runs under each. The create takes ONE creative per call, so the
// first ad opens a campaign and the rest attach to it with adSetId.
async function pushToLinkedIn(args: PushArgs) {
  const {
    input,
    context,
    campaign,
    brand,
    draft,
    destination,
    compiled,
    ads,
    budgetAmount,
    budgetType,
    settings,
    startDate,
    endDate,
    warnings,
  } = args;

  const usable = creativeAds(ads);
  if (usable.length === 0) {
    throw new Error(
      "LinkedIn needs at least one creative ad with an image or video — text ads compile to Google only",
    );
  }
  const skippedText = textAds(ads).length;
  if (skippedText > 0) {
    warnings.push(
      `${skippedText} text ad(s) were not sent to LinkedIn — they compile to Google`,
    );
  }
  const linkUrl =
    usable.find(({ content }) => content.linkUrl)?.content.linkUrl ??
    campaign.landingUrl ??
    undefined;
  const requirement = linkedInCreativeRequirement({
    goal: input.goal,
    hasVideo: usable.some(({ content }) => isVideoContent(content)),
    linkUrl,
  });
  if (requirement) throw new Error(requirement);
  if (input.validateOnly) {
    throw new Error(
      "LinkedIn has no dry run through Zernio — push it paused and review it in Campaign Manager",
    );
  }

  const linkedin = settings.linkedin ?? {};
  const bidding =
    linkedin.costType || linkedin.unitCost != null
      ? {
          costType: linkedin.costType ?? "CPM",
          ...(linkedin.unitCost != null ? { unitCost: linkedin.unitCost } : {}),
        }
      : {};

  const isCarousel = (content: AdCreativeContent) =>
    !isVideoContent(content) && (content.media?.length ?? 0) >= 2;

  /** One creative as the LinkedIn create wants it: image, video or carousel. */
  const creativePayload = (
    content: AdCreativeContent,
  ): Pick<
    CreateZernioStandaloneAdInput,
    | "headline"
    | "body"
    | "linkUrl"
    | "callToAction"
    | "imageUrl"
    | "video"
    | "platformSpecificData"
  > => ({
    headline: content.headline,
    body: content.body,
    linkUrl: content.linkUrl ?? linkUrl,
    callToAction: content.callToAction ?? linkedin.callToAction,
    ...(isVideoContent(content)
      ? // LinkedIn generates the poster frame itself; no thumbnail needed.
        { video: { url: content.media[0]!.url } }
      : isCarousel(content)
        ? {
            platformSpecificData: {
              carousel: {
                cards: content.media
                  .slice(0, LINKEDIN_CAROUSEL_CARDS.max)
                  .map((item, index) => ({
                    imageUrl: item.url,
                    headline: index === 0 ? content.headline : undefined,
                    landingUrl: content.linkUrl ?? linkUrl,
                  })),
              },
            },
          }
        : { imageUrl: content.media[0]!.url }),
  });

  /** Opens a LinkedIn campaign — and, without existingCampaignId, its group. */
  const openingPayload = (setArgs: {
    audience: PlanAudience | null;
    spec: ZernioAdTargeting | undefined;
    existingCampaignId?: string;
    lead: (typeof usable)[number];
  }): CreateZernioStandaloneAdInput => {
    const { platformSpecificData: creativeData, ...creative } = creativePayload(
      setArgs.lead.content,
    );
    const platformSpecificData = { ...bidding, ...(creativeData ?? {}) };
    return {
      accountId: input.connectionAccountId,
      adAccountId: destination.adAccount.id,
      organizationId: linkedin.organizationId,
      ...(setArgs.existingCampaignId
        ? { existingCampaignId: setArgs.existingCampaignId }
        : { campaignName: campaign.name }),
      name: setArgs.existingCampaignId
        ? (setArgs.audience?.name ?? campaign.name)
        : campaign.name,
      adSetName: setArgs.audience?.name,
      adName: setArgs.lead.ad.name,
      goal: input.goal,
      budgetAmount,
      budgetType,
      ...creative,
      ...(Object.keys(platformSpecificData).length > 0
        ? { platformSpecificData }
        : {}),
      targeting: setArgs.spec,
      startDate,
      endDate,
      ...linkedInDraftProviderControls(),
    };
  };

  /** One more creative under an existing LinkedIn campaign; it inherits the rest. */
  const attachPayload = (
    adSetId: string,
    ad: Ad,
    content: AdCreativeContent,
  ): CreateZernioStandaloneAdInput => ({
    accountId: input.connectionAccountId,
    adAccountId: destination.adAccount.id,
    organizationId: linkedin.organizationId,
    adSetId,
    name: ad.name,
    adName: ad.name,
    goal: input.goal,
    ...creativePayload(content),
    ...linkedInDraftProviderControls(),
  });

  type CreatedSet = {
    lead: (typeof usable)[number];
    result: ZernioAdWriteResponse;
    attached: Array<{ planAd: Ad; result: ZernioAdWriteResponse }>;
  };

  /**
   * Create one LinkedIn campaign and every creative inside it. A failed
   * attach on a fresh group deletes the group rather than stranding it.
   */
  const createCampaignWithAds = async (setArgs: {
    audience: PlanAudience | null;
    spec: ZernioAdTargeting | undefined;
    existingCampaignId?: string;
    keyScope: string;
  }): Promise<CreatedSet> => {
    const [lead, ...rest] = usable;
    const payload = openingPayload({ ...setArgs, lead: lead! });
    const result = await createLinkedInAd(payload, {
      idempotencyKey: idempotencyKey(
        context,
        `push-adset:${setArgs.keyScope}`,
        payload,
      ),
      adAccount: destination.adAccount,
    });
    const rollbackCampaignId = setArgs.existingCampaignId
      ? null
      : writtenCampaignId(result);
    const attached: CreatedSet["attached"] = [];
    try {
      const adSetId = writtenAdSetId(result);
      for (const { ad, content } of rest) {
        if (!adSetId) {
          throw new Error(
            `Zernio created the LinkedIn campaign but returned no campaign id to attach the remaining creatives to. Response carried: ${Object.keys(
              result,
            ).join(", ")}${
              result.ad
                ? ` (ad: ${Object.keys(result.ad).join(", ")})`
                : " (no ad object)"
            }`,
          );
        }
        const attach = attachPayload(adSetId, ad, content);
        attached.push({
          planAd: ad,
          result: await createLinkedInAd(attach, {
            idempotencyKey: idempotencyKey(
              context,
              `push-attach:${setArgs.keyScope}:${ad.id}`,
              attach,
            ),
            adAccount: destination.adAccount,
          }),
        });
      }
    } catch (error) {
      const cleanedUp = rollbackCampaignId
        ? await deleteZernioCampaign({
            campaignId: rollbackCampaignId,
            accountId: input.connectionAccountId,
          })
            .then(() => true)
            .catch((cleanupError) => {
              console.error(
                "attach rollback failed",
                rollbackCampaignId,
                cleanupError,
              );
              return false;
            })
        : null;
      throw new Error(
        `Push failed while attaching creative ${attached.length + 2} of ${usable.length}${
          cleanedUp === true
            ? " — the campaign group was removed from LinkedIn so nothing is half-built"
            : cleanedUp === false
              ? ` — removing campaign group ${rollbackCampaignId} from LinkedIn also failed, delete it in Campaign Manager`
              : setArgs.existingCampaignId
                ? " — the campaign it was attaching to was already there and was left alone"
                : // No id came back, so there is nothing to delete BY id even
                  // though a campaign was created. Silence here read as "nothing
                  // was created": a first live push left an orphaned group and
                  // campaign in Campaign Manager while the operator was told
                  // the failure was clean.
                  " — a campaign group WAS created on LinkedIn but no id came back, so it could not be removed. Check Campaign Manager and delete it by hand"
        }. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { lead: lead!, result, attached };
  };

  const externalAdId = (row: ZernioAdWriteResponse["ad"] | undefined) =>
    (typeof row?.platformAdId === "string" ? row.platformAdId : null) ??
    row?.id ??
    row?._id ??
    null;

  /** Plan lineage: the opening call made the lead ad, each attach one more. */
  const setAdsFor = (set: CreatedSet) => [
    {
      planAd: set.lead.ad,
      externalId: externalAdId(set.result.ad ?? set.result.ads?.[0]),
      headline: set.lead.content.headline,
      body: set.lead.content.body,
      linkUrl: set.lead.content.linkUrl ?? linkUrl ?? null,
      media: set.lead.content.media,
    },
    ...set.attached.map(({ planAd, result }) => {
      const content = planAd.content as AdCreativeContent;
      return {
        planAd,
        externalId: externalAdId(result.ad ?? result.ads?.[0]),
        headline: content.headline,
        body: content.body,
        linkUrl: content.linkUrl ?? linkUrl ?? null,
        media: content.media,
      };
    }),
  ];

  const heroThumbnailUrl = usable[0]!.content.media[0]?.url ?? null;
  const path = `/app/brands/${brand.slug}/ads/platform/${draft.id}`;

  // ---- one (or no) audience: one campaign under a fresh group ------------
  if (compiled.length <= 1) {
    const only = compiled[0] ?? null;
    const set = await createCampaignWithAds({
      audience: only?.audience ?? null,
      spec: only?.spec,
      keyScope: `push:${campaign.id}:linkedin`,
    });
    await recordCompiledCampaign({
      adAccountId: destination.adAccount.id,
      draft,
      campaign,
      status: "paused",
      budgetAmount,
      budgetType,
      externalCampaignId: writtenCampaignId(set.result),
      heroThumbnailUrl,
      sets: [
        {
          audience: only?.audience ?? null,
          name: only?.audience.name ?? campaign.name,
          externalId: writtenAdSetId(set.result),
          targetingSpec: only?.spec ?? null,
          budget: budgetAmount,
          budgetType,
          ads: setAdsFor(set),
        },
      ],
    });
    return {
      campaignId: campaign.id,
      platform: "linkedin_ads" as const,
      validateOnly: false,
      platformCampaignRowId: draft.id,
      adSetsCreated: 1,
      adsCreated: usable.length,
      path,
      warnings,
    };
  }

  // ---- several audiences: the group first, then one campaign each --------
  // A LinkedIn group takes no budget; every campaign under it brings its own.
  const shell = await createZernioAdCampaign(
    {
      accountId: input.connectionAccountId,
      adAccountId: destination.adAccount.id,
      name: campaign.name,
      goal: input.goal,
      status: "PAUSED",
    },
    {
      idempotencyKey: idempotencyKey(
        context,
        "push-shell",
        { campaignId: campaign.id },
        // The draft's edit time is in the key: a replayed shell carries the old
        // budget, or a campaign deleted after a failed push.
        `shell:${campaign.id}:linkedin:${draft.updatedAt.getTime()}`,
      ),
    },
  );
  const shellId =
    shell.campaignId ??
    shell.campaign?.platformCampaignId ??
    shell.campaign?.id ??
    null;
  if (!shellId) {
    throw new Error("Zernio returned no campaign group id for the shell");
  }

  const perSet: Array<{
    audience: PlanAudience;
    spec: ZernioAdTargeting | undefined;
    set: CreatedSet;
  }> = [];
  try {
    for (const { audience, spec } of compiled) {
      const set = await createCampaignWithAds({
        audience,
        spec,
        existingCampaignId: shellId,
        // Suffixed so a plan pushed to Meta and LinkedIn never shares a key.
        keyScope: `push:${campaign.id}:${audience.id}:linkedin`,
      });
      perSet.push({ audience, spec, set });
    }
  } catch (error) {
    const cleanedUp = await deleteZernioCampaign({
      campaignId: shellId,
      accountId: input.connectionAccountId,
    })
      .then(() => true)
      .catch((cleanupError) => {
        console.error("push rollback failed", shellId, cleanupError);
        return false;
      });
    await retireShellKey(draft.id);
    throw new Error(
      `Push failed after ${perSet.length} of ${compiled.length} audiences — ${
        cleanedUp
          ? "the campaign group was removed from LinkedIn so nothing is half-built"
          : `removing campaign group ${shellId} from LinkedIn also failed, delete it in Campaign Manager`
      }. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await recordCompiledCampaign({
    adAccountId: destination.adAccount.id,
    draft,
    campaign,
    status: "paused",
    budgetAmount,
    budgetType,
    externalCampaignId: shellId,
    heroThumbnailUrl,
    sets: perSet.map(({ audience, spec, set }) => ({
      audience,
      name: audience.name,
      externalId: set.result.platformAdSetId ?? null,
      targetingSpec: spec ?? null,
      budget: budgetAmount,
      budgetType,
      ads: setAdsFor(set),
    })),
  });

  return {
    campaignId: campaign.id,
    platform: "linkedin_ads" as const,
    validateOnly: false,
    platformCampaignRowId: draft.id,
    adSetsCreated: perSet.length,
    adsCreated: perSet.length * usable.length,
    path,
    warnings,
  };
}

/**
 * Record what the compile created: the draft platform_campaign becomes real
 * (externalId, status), and mirror rows are written for every ad set and ad
 * with their plan lineage. The mirror describes what the platform now holds.
 */
async function recordCompiledCampaign(input: {
  draft: PlatformCampaign;
  campaign: Campaign;
  status: PlatformCampaignStatus;
  budgetAmount: number;
  budgetType: "daily" | "lifetime";
  externalCampaignId: string | null;
  heroThumbnailUrl: string | null;
  /** The account the campaign was created under, for the manage deep link. */
  adAccountId: string;
  sets: Array<{
    audience: PlanAudience | null;
    name: string;
    externalId: string | null;
    targetingSpec: ZernioAdTargeting | null;
    budget: number | null;
    budgetType: string | null;
    ads: Array<{
      planAd: Ad;
      externalId: string | null;
      headline: string | null;
      body: string | null;
      linkUrl: string | null;
      media: MediaItem[] | null;
    }>;
  }>;
}) {
  const adCount = input.sets.reduce((n, set) => n + set.ads.length, 0);
  await db
    .update(platformCampaignTable)
    .set({
      externalId: input.externalCampaignId,
      status: input.status,
      budget: input.budgetAmount,
      budgetType: input.budgetType,
      adCount,
      heroThumbnailUrl: input.heroThumbnailUrl,
      // Sync sets this when it PULLS a campaign, so a pushed one had no link
      // to the platform at all and the "Open in platform" button never
      // appeared on the thing we had just created.
      ...(input.externalCampaignId
        ? {
            manageUrl:
              adPlatformSpec(input.draft.platform)?.campaignManageUrl(
                input.adAccountId,
                input.externalCampaignId,
                input.sets.flatMap((set) =>
                  set.externalId ? [set.externalId] : [],
                ),
              ) ?? null,
          }
        : {}),
    })
    .where(eq(platformCampaignTable.id, input.draft.id));

  await db
    .update(campaignTable)
    .set({ status: "active" })
    .where(eq(campaignTable.id, input.campaign.id));

  for (const set of input.sets) {
    const [setRow] = await db
      .insert(platformAdSetTable)
      .values({
        id: createId("pas"),
        platformCampaignId: input.draft.id,
        brandId: input.draft.brandId,
        audienceId: set.audience?.id ?? null,
        name: set.name,
        status: input.status,
        targetingSpec: set.targetingSpec,
        budget: set.budget,
        budgetType: set.budgetType,
        externalId: set.externalId,
      })
      .returning({ id: platformAdSetTable.id });
    for (const ad of set.ads) {
      await db.insert(platformAdTable).values({
        id: createId("pad"),
        platformCampaignId: input.draft.id,
        platformAdSetId: setRow!.id,
        brandId: input.draft.brandId,
        channelId: input.draft.channelId,
        platform: input.draft.platform,
        adId: ad.planAd.id,
        name: ad.planAd.name,
        headline: ad.headline,
        body: ad.body,
        linkUrl: ad.linkUrl,
        media: ad.media,
        thumbnailUrl: ad.media?.[0]?.url ?? null,
        status: input.status,
        externalAdSetId: set.externalId,
        adSetName: set.name,
        externalId: ad.externalId,
        businessKey: ad.planAd.businessKey,
      });
    }
  }
}

// ---- DELETE ------------------------------------------------------------

/**
 * Delete a platform campaign: the real one, on the real ad account.
 *
 * A provider delete that cascades to ad sets and ads, so it is the operator's
 * click that authorizes it — never chat, never a background job. The local
 * rows go only after the platform confirms, so a failed provider call leaves
 * growth still describing reality rather than quietly forgetting a campaign
 * that is still live and still spending.
 */
export async function deletePlatformCampaign(
  input: { platformCampaignId: string; connectionAccountId?: string },
  context: AdsWriteContext,
) {
  const platformCampaign = await db.query.platformCampaignTable.findFirst({
    where: eq(platformCampaignTable.id, input.platformCampaignId),
  });
  if (!platformCampaign) throw new Error("Platform campaign not found");
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, platformCampaign.brandId),
    columns: { id: true, organizationId: true },
  });
  if (brand?.organizationId !== context.organizationId) {
    throw new Error("No access to this campaign");
  }

  let provider: Record<string, unknown> | null = null;
  if (platformCampaign.externalId) {
    provider = await deleteZernioCampaign({
      campaignId: platformCampaign.externalId,
      // Needed only for an empty shell, ignored otherwise — so always send it
      // when we know it, and a stranded shell deletes like anything else.
      accountId: input.connectionAccountId,
    });
  }

  // platform_ad_set and platform_ad cascade with the campaign row; the plan
  // rows (campaign, audiences, ads) are untouched — they can push again.
  await db
    .delete(platformCampaignTable)
    .where(eq(platformCampaignTable.id, platformCampaign.id));

  return {
    deleted: true,
    hadExternalId: Boolean(platformCampaign.externalId),
    provider,
  };
}
