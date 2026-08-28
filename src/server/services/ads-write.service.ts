import "server-only";

import { createHash } from "node:crypto";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import {
  adWriteIdempotencyKey,
  allowlistPlatform,
  googleCreativeRequirement,
  metaDraftProviderControls,
  sameAdAccountId,
  type ZernioAdPlatform,
  zernioConnectionMatchesPlatform,
} from "@/lib/zernio-ads";
import {
  addUsersToZernioAdAudience,
  boostZernioMetaPost,
  createZernioAdAudience,
  createZernioAdCampaign,
  createZernioStandaloneAd,
  duplicateZernioMetaCampaign,
  getZernioAdsTree,
  listZernioAccounts,
  listZernioAdAccounts,
  setZernioCampaignStatus,
  ZERNIO_AUDIENCE_USERS_MAX_PER_REQUEST,
  type CreateZernioStandaloneAdInput,
  type ZernioAccount,
  type ZernioAdTargeting,
  type ZernioAdWriteResponse,
  type ZernioAudienceUser,
  type ZernioCarouselCard,
} from "@/server/clients/zernio.client";
import { db } from "@/server/db";
import {
  adAccountTable,
  adSetTable,
  adSpotTable,
  audienceTable,
  audienceTargetTable,
  brandTable,
  platformCampaignTable,
  channelTable,
  campaignTable,
  type Brand,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";

type AdsWriteContext = { organizationId: string; runId: string };

type AdDestination = {
  brand: Pick<Brand, "id" | "slug" | "name" | "zernioProfileId">;
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
    },
  });
  if (!brand) throw new Error(`Owned brand not found: ${brandSlug}`);
  if (!brand.zernioProfileId) {
    throw new Error(`Connect ${brand.name} to its Zernio profile first`);
  }
  return brand;
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
      return providerAccounts.flatMap((adAccount) => {
        const allowedRow = allowed.find((row) =>
          sameAdAccountId(input.platform, row.externalId, adAccount.id),
        );
        if (!allowedRow || adAccount.selectable === false) return [];
        return [
          {
            connectionAccountId: connectionId,
            connectionName:
              connection.displayName ?? connection.name ?? connection.username,
            adAccountId: adAccount.id,
            adAccountName: adAccount.name ?? allowedRow.name ?? undefined,
            currency: adAccount.currency,
            minimumDailyBudget: adAccount.minimumDailyBudget,
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
    brand: { id: brand.id, slug: brand.slug, name: brand.name },
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
    throw new Error(
      `That ${input.platform} Zernio connection is not active for ${brand.name}`,
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
  if (input.budgetType === "lifetime" && !input.endDate) {
    throw new Error("Meta lifetime budgets require endDate");
  }
  if (
    input.goal === "catalog_sales" &&
    (!input.promotedObject?.productSetId ||
      !input.promotedObject.pixelId ||
      !input.promotedObject.customEventType)
  ) {
    throw new Error(
      "Meta catalog sales require promotedObject.productSetId, pixelId, and customEventType",
    );
  }
  if (
    ["conversions", "lead_conversion"].includes(input.goal) &&
    (!input.promotedObject?.pixelId ||
      (!input.promotedObject.customEventType &&
        !input.promotedObject.customConversionId))
  ) {
    throw new Error(
      `${input.goal} requires promotedObject.pixelId and an event or custom conversion`,
    );
  }
  if (input.goal === "lead_generation" && !input.leadGenFormId) {
    throw new Error("Meta lead generation requires leadGenFormId");
  }
  if (
    input.goal === "app_promotion" &&
    (!input.promotedObject?.applicationId ||
      !input.promotedObject.objectStoreUrl)
  ) {
    throw new Error(
      "Meta app promotion requires promotedObject.applicationId and objectStoreUrl",
    );
  }
  if (input.imageUrl && input.carouselCards) {
    throw new Error(
      "Provide imageUrl or carouselCards, not both — a carousel replaces the single creative",
    );
  }
  if (
    input.carouselCards &&
    (input.carouselCards.length < 2 || input.carouselCards.length > 10)
  ) {
    throw new Error("Meta carousels take 2–10 cards");
  }
  if (
    input.goal !== "catalog_sales" &&
    !input.imageUrl &&
    !input.carouselCards
  ) {
    throw new Error("This Meta draft requires imageUrl or carouselCards");
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
  const result = await createZernioStandaloneAd(payload, {
    idempotencyKey: idempotencyKey(context, "create-meta", payload, input.businessKey),
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
    idempotencyKey: idempotencyKey(context, "create-google", payload, input.businessKey),
  });
  return {
    brand: destination.brand,
    connectionAccountId: input.connectionAccountId,
    adAccount: destination.adAccount,
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
    idempotencyKey: idempotencyKey(context, "boost-meta", payload, input.businessKey),
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
        { platformCampaignId: input.platformCampaignId, renameSuffix: input.renameSuffix },
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
   * The first-party audience_target this platform asset fulfils. Stamping it
   * is what keeps "who we are buying" defined once and compiled per platform,
   * rather than the platform asset becoming its own orphan definition.
   */
  audienceTargetId?: string;
};

/**
 * Create a Meta custom audience through the brand's allowlisted destination.
 * No spend, but a provider write — and Zernio's create endpoint is NOT
 * idempotent (no Idempotency-Key support), so a failure here must surface to
 * the operator instead of being retried.
 */
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
  if (input.audienceTargetId) {
    const target = await db.query.audienceTargetTable.findFirst({
      where: eq(audienceTargetTable.id, input.audienceTargetId),
      columns: { brandId: true },
    });
    if (target?.brandId !== destination.brand.id) {
      throw new Error("That audience target belongs to a different brand");
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
  // page and linked to the first-party target it fulfils.
  const externalId =
    (typeof provider.id === "string" ? provider.id : undefined) ??
    (typeof provider._id === "string" ? provider._id : undefined) ??
    null;
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
    [mirrored] = await db
      .insert(audienceTable)
      .values({
        id: createId("aud"),
        channelId: channel.id,
        brandId: destination.brand.id,
        targetId: input.audienceTargetId ?? null,
        name: input.name,
        type: input.type === "lookalike" ? "lookalike" : "custom",
        source: "manual",
        externalId,
      })
      .returning();
  }

  return {
    brand: destination.brand,
    adAccount: destination.adAccount,
    audienceId: mirrored?.id ?? null,
    audienceTargetId: input.audienceTargetId ?? null,
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
  audienceId: string;
  users: ZernioAudienceUser[];
}) {
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
      await addUsersToZernioAdAudience(input.audienceId, chunk);
      uploaded += chunk.length;
    }
  } catch (error) {
    throw new Error(
      `Audience upload failed after ${uploaded}/${input.users.length} members: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { audienceId: input.audienceId, uploaded, total: input.users.length };
}

// ---- DELIVERY SWITCH -------------------------------------------------

const DELIVERY_PLATFORMS: Record<string, string> = {
  meta_ads: "facebook",
  google_ads: "google",
};

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
  const platform = DELIVERY_PLATFORMS[campaign.platform];
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
    .returning({ id: platformCampaignTable.id, status: platformCampaignTable.status });

  return { campaign: updated, provider };
}


/**
 * The platform id of the audience an ad set buys. Our first-party
 * `audience_target` is the "who"; the mirrored `audience` row carries the
 * platform's own id, which is what targeting actually accepts. Returns null
 * when the target has never been compiled to this platform — the ad set then
 * runs on its geo/demographic targeting alone rather than failing the push.
 */
async function platformAudienceIdFor(
  audienceTargetId: string | null,
  brandId: string,
  platform: "meta_ads" | "google_ads",
): Promise<string | null> {
  if (!audienceTargetId) return null;
  const rows = await db
    .select({ externalId: audienceTable.externalId })
    .from(audienceTable)
    .innerJoin(channelTable, eq(channelTable.id, audienceTable.channelId))
    .where(
      and(
        eq(audienceTable.targetId, audienceTargetId),
        eq(audienceTable.brandId, brandId),
        eq(channelTable.platform, platform),
        isNotNull(audienceTable.externalId),
      ),
    )
    .limit(1);
  return rows[0]?.externalId ?? null;
}

// ---- DRAFT → PLATFORM --------------------------------------------------

/**
 * Push a first-party draft (an initiative) to Meta: ONE campaign + ONE ad set
 * + its drafted ads, via Zernio's multi-creative shape, forced PAUSED. The
 * local `campaign` row is created FROM the platform response, so a campaign
 * row always means a real campaign on a real ad account. The operator's click
 * is the approval; spend starts only when the delivery switch is flipped.
 */
export async function pushDraftToPlatform(
  input: {
    campaignId: string;
    platform?: "meta_ads" | "google_ads";
    connectionAccountId: string;
    adAccountId: string;
    goal:
      | "engagement"
      | "traffic"
      | "awareness"
      | "video_views"
      | "conversions";
    budgetAmount: number;
    budgetType: "daily" | "lifetime";
    validateOnly?: boolean;
    promotedObject?: { pixelId?: string; customEventType?: string };
  },
  context: AdsWriteContext,
) {
  const platform = input.platform ?? "meta_ads";
  const campaign = await db.query.campaignTable.findFirst({
    where: eq(campaignTable.id, input.campaignId),
  });
  if (!campaign) throw new Error("Campaign draft not found");
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, campaign.brandId),
  });
  if (brand?.organizationId !== context.organizationId) {
    throw new Error("No access to this campaign draft");
  }
  if (!brand.slug) throw new Error("Brand has no slug");

  const alreadyLive = await db.query.platformCampaignTable.findFirst({
    where: and(
      eq(platformCampaignTable.campaignId, campaign.id),
      eq(platformCampaignTable.platform, platform),
    ),
    columns: { id: true },
  });
  if (alreadyLive) {
    throw new Error(
      `This campaign already exists on ${platform === "meta_ads" ? "Meta" : "Google"} — edit it there, or draft a new push`,
    );
  }

  const destination = await requireAdDestination({
    organizationId: context.organizationId,
    brandSlug: brand.slug,
    platform: platform === "meta_ads" ? "meta" : "google",
    connectionAccountId: input.connectionAccountId,
    adAccountId: input.adAccountId,
  });

  const spots = await db.query.adSpotTable.findMany({
    where: and(
      eq(adSpotTable.campaignId, campaign.id),
      isNull(adSpotTable.externalId),
    ),
  });
  if (spots.length === 0) {
    throw new Error("This draft has no ads to push — add ads first");
  }
  const missingCreative = spots.filter(
    (spot) => !spot.media?.[0]?.url || spot.media[0].type !== "image",
  );
  if (missingCreative.length > 0) {
    throw new Error(
      `${missingCreative.length} drafted ad(s) need an image creative: ${missingCreative
        .map((spot) => spot.name ?? spot.id)
        .join(", ")}`,
    );
  }
  const linkUrl =
    spots.find((spot) => spot.linkUrl)?.linkUrl ?? campaign.landingUrl;
  if (!linkUrl) {
    throw new Error(
      "Set a landing URL on the campaign, or a link URL on at least one ad",
    );
  }

  const adSets = await db.query.adSetTable.findMany({
    where: eq(adSetTable.campaignId, campaign.id),
  });

  // ---- GOOGLE ---------------------------------------------------------
  // Google's hierarchy is campaign → ad group, and its campaign TYPE decides
  // everything (Search needs keywords, Display needs sized images). One call
  // builds the whole tree; multi-ad-group is not modelled yet.
  if (platform === "google_ads") {
    const google = campaign.platformConfig?.google;
    const campaignType = google?.campaignType;
    if (!campaignType) {
      throw new Error(
        "Set the Google campaign type (search or display) on the campaign first",
      );
    }
    if (campaignType === "search" && (google?.keywords ?? []).length === 0) {
      throw new Error(
        "A Google Search campaign needs keywords — it buys nothing without them",
      );
    }
    if (input.goal === "conversions") {
      throw new Error("Google push supports traffic, engagement, awareness, and video_views");
    }
    const hero = spots[0]!;
    const result = await createGoogleAd(
      {
        businessKey: `push:${campaign.id}:google`,
        brandSlug: brand.slug,
        connectionAccountId: input.connectionAccountId,
        adAccountId: destination.adAccount.id,
        name: campaign.name,
        campaignType,
        goal: input.goal,
        budgetAmount: input.budgetAmount,
        budgetType: input.budgetType,
        headline: hero.headline ?? hero.name ?? campaign.name,
        body: hero.body ?? campaign.description ?? campaign.name,
        linkUrl,
        keywords: google?.keywords,
        negativeKeywords: google?.negativeKeywords,
        additionalHeadlines: google?.additionalHeadlines,
        additionalDescriptions: google?.additionalDescriptions,
        businessName: google?.businessName ?? brand.name,
        images:
          campaignType === "display"
            ? { landscape: hero.media![0]!.url, square: hero.media![0]!.url }
            : undefined,
      },
      context,
    );
    if (input.validateOnly) {
      return {
        campaignId: campaign.id,
        platform,
        validateOnly: true,
        adsCreated: 0,
        provider: result,
      };
    }
    const created = await recordPlatformCampaign({
      campaign,
      brand,
      platform,
      goal: input.goal,
      budgetAmount: input.budgetAmount,
      platformCampaignId:
        (result.provider as ZernioAdWriteResponse | undefined)
          ?.platformCampaignId ?? null,
      spots,
      adSets,
      platformAdSetId:
        (result.provider as ZernioAdWriteResponse | undefined)
          ?.platformAdSetId ?? null,
    });
    return {
      campaignId: campaign.id,
      platform,
      validateOnly: false,
      platformCampaignRowId: created.id,
      adsCreated: spots.length,
      path: `/app/brands/${brand.slug}/ads/${created.id}`,
      provider: result,
    };
  }

  // ---- META -----------------------------------------------------------
  if (
    input.goal === "conversions" &&
    !(input.promotedObject?.pixelId && input.promotedObject.customEventType)
  ) {
    throw new Error(
      "conversions requires promotedObject.pixelId and customEventType",
    );
  }

  const creativesFor = (subset: typeof spots) =>
    subset.map((spot) => ({
      name: spot.name ?? campaign.name,
      headline: spot.headline ?? undefined,
      body: spot.body ?? undefined,
      imageUrl: spot.media![0]!.url,
      linkUrl: spot.linkUrl ?? linkUrl,
    }));

  // One ad set (or none defined) is a single call — fewer moving parts and
  // nothing to clean up if Meta rejects it.
  if (adSets.length <= 1) {
    const only = adSets[0];
    const audienceId = only
      ? await platformAudienceIdFor(only.audienceTargetId, brand.id, platform)
      : null;
    const payload: CreateZernioStandaloneAdInput = {
      accountId: input.connectionAccountId,
      adAccountId: destination.adAccount.id,
      name: campaign.name,
      campaignName: campaign.name,
      adSetName: only?.name,
      goal: input.goal,
      budgetAmount: only?.budget ?? input.budgetAmount,
      budgetType: (only?.budgetType as "daily" | "lifetime") ?? input.budgetType,
      headline: spots[0]!.headline ?? spots[0]!.name ?? campaign.name,
      body: spots[0]!.body ?? campaign.name,
      linkUrl,
      creatives: creativesFor(spots),
      targeting: audienceId ? { audienceId } : undefined,
      promotedObject: input.promotedObject,
      ...metaDraftProviderControls(input.validateOnly),
    };
    const result = await createZernioStandaloneAd(payload, {
      idempotencyKey: idempotencyKey(
        context,
        "push-draft",
        payload,
        `push:${campaign.id}:meta`,
      ),
    });
    if (input.validateOnly || result.validateOnly) {
      return {
        campaignId: campaign.id,
        platform,
        validateOnly: true,
        adsCreated: 0,
        provider: result,
      };
    }
    const created = await recordPlatformCampaign({
      campaign,
      brand,
      platform,
      goal: input.goal,
      budgetAmount: input.budgetAmount,
      platformCampaignId: result.platformCampaignId ?? null,
      spots,
      adSets,
      platformAdSetId: result.platformAdSetId ?? null,
    });
    return {
      campaignId: campaign.id,
      platform,
      validateOnly: false,
      platformCampaignRowId: created.id,
      adsCreated: (result.ads ?? (result.ad ? [result.ad] : [])).length,
      path: `/app/brands/${brand.slug}/ads/${created.id}`,
      provider: result,
    };
  }

  // Several ad sets: create the campaign shell once with NO budget (ABO, so
  // each ad set brings its own), then one create per ad set carrying its
  // budget, its audience, and the ads assigned to it.
  if (input.validateOnly) {
    throw new Error(
      "Dry run covers single-ad-set pushes only; Meta has no dry run for the two-step shape",
    );
  }
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
        `shell:${campaign.id}:meta`,
      ),
    },
  );
  const shellId =
    shell.campaign?.platformCampaignId ?? shell.campaign?.id ?? null;
  if (!shellId) throw new Error("Zernio returned no campaign id for the shell");

  const perAdSet = [];
  for (const adSet of adSets) {
    const assigned = spots.filter((spot) => spot.adSetRowId === adSet.id);
    // Ads with no ad set assigned ride with the first one rather than being
    // silently dropped.
    const subset =
      assigned.length > 0
        ? assigned
        : adSet.id === adSets[0]!.id
          ? spots.filter((spot) => !spot.adSetRowId)
          : [];
    if (subset.length === 0) continue;
    const audienceId = await platformAudienceIdFor(
      adSet.audienceTargetId,
      brand.id,
      platform,
    );
    const payload: CreateZernioStandaloneAdInput = {
      accountId: input.connectionAccountId,
      adAccountId: destination.adAccount.id,
      existingCampaignId: shellId,
      name: adSet.name,
      adSetName: adSet.name,
      goal: input.goal,
      budgetAmount: adSet.budget ?? input.budgetAmount,
      budgetType:
        (adSet.budgetType as "daily" | "lifetime") ?? input.budgetType,
      headline: subset[0]!.headline ?? subset[0]!.name ?? campaign.name,
      body: subset[0]!.body ?? campaign.name,
      linkUrl,
      creatives: creativesFor(subset),
      targeting: audienceId ? { audienceId } : undefined,
      promotedObject: input.promotedObject,
      ...metaDraftProviderControls(false),
    };
    const result = await createZernioStandaloneAd(payload, {
      idempotencyKey: idempotencyKey(
        context,
        "push-adset",
        payload,
        `push:${campaign.id}:${adSet.id}`,
      ),
    });
    perAdSet.push({ adSet, result, subset });
  }

  const created = await recordPlatformCampaign({
    campaign,
    brand,
    platform,
    goal: input.goal,
    budgetAmount: input.budgetAmount,
    platformCampaignId: shellId,
    spots: [],
    adSets: [],
    platformAdSetId: null,
  });

  for (const { adSet, result, subset } of perAdSet) {
    await db
      .update(adSetTable)
      .set({
        platformCampaignId: created.id,
        externalId: result.platformAdSetId ?? null,
        status: "paused",
      })
      .where(eq(adSetTable.id, adSet.id));
    const responseAds = result.ads ?? (result.ad ? [result.ad] : []);
    for (const spot of subset) {
      const match =
        responseAds.find((ad) => ad.name === spot.name) ??
        (responseAds.length === 1 ? responseAds[0] : undefined);
      await db
        .update(adSpotTable)
        .set({
          platformCampaignId: created.id,
          externalId:
            (typeof match?.platformAdId === "string"
              ? match.platformAdId
              : null) ??
            match?.id ??
            match?._id ??
            null,
          adSetId: result.platformAdSetId ?? null,
          status: "paused",
        })
        .where(eq(adSpotTable.id, spot.id));
    }
  }

  return {
    campaignId: campaign.id,
    platform,
    validateOnly: false,
    platformCampaignRowId: created.id,
    adSetsCreated: perAdSet.length,
    adsCreated: perAdSet.reduce((n, entry) => n + entry.subset.length, 0),
    path: `/app/brands/${brand.slug}/ads/${created.id}`,
  };
}

/**
 * Mirror what the platform created: the platform_campaign row plus the
 * externalIds on the ads and ad sets it produced.
 */
async function recordPlatformCampaign(input: {
  campaign: typeof campaignTable.$inferSelect;
  brand: Brand;
  platform: "meta_ads" | "google_ads";
  goal: string;
  budgetAmount: number;
  platformCampaignId: string | null;
  spots: (typeof adSpotTable.$inferSelect)[];
  adSets: (typeof adSetTable.$inferSelect)[];
  platformAdSetId: string | null;
}) {
  const channel = await db.query.channelTable.findFirst({
    where: and(
      eq(channelTable.brandId, input.brand.id),
      eq(channelTable.platform, input.platform),
      isNull(channelTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!channel) {
    throw new Error(
      "The ads were created but no local channel exists to file them under — run Pull recent ads",
    );
  }
  const [created] = await db
    .insert(platformCampaignTable)
    .values({
      id: createId("pcamp"),
      channelId: channel.id,
      brandId: input.brand.id,
      platform: input.platform,
      campaignId: input.campaign.id,
      name: input.campaign.name,
      status: "paused",
      objective: input.goal,
      budget: Math.round(input.budgetAmount),
      externalId: input.platformCampaignId,
    })
    .returning();

  await db
    .update(campaignTable)
    .set({ status: "active" })
    .where(eq(campaignTable.id, input.campaign.id));

  for (const spot of input.spots) {
    await db
      .update(adSpotTable)
      .set({
        platformCampaignId: created!.id,
        channelId: channel.id,
        adSetId: input.platformAdSetId,
        status: "paused",
      })
      .where(eq(adSpotTable.id, spot.id));
  }
  for (const adSet of input.adSets) {
    await db
      .update(adSetTable)
      .set({
        platformCampaignId: created!.id,
        externalId: input.platformAdSetId,
      })
      .where(eq(adSetTable.id, adSet.id));
  }
  return created!;
}
