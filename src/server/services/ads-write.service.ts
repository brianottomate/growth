import "server-only";

import { createHash } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

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
  createZernioStandaloneAd,
  duplicateZernioMetaCampaign,
  getZernioAdsTree,
  listZernioAccounts,
  listZernioAdAccounts,
  ZERNIO_AUDIENCE_USERS_MAX_PER_REQUEST,
  type CreateZernioStandaloneAdInput,
  type ZernioAccount,
  type ZernioAdTargeting,
  type ZernioAudienceUser,
  type ZernioCarouselCard,
} from "@/server/clients/zernio.client";
import { db } from "@/server/db";
import { adAccountTable, brandTable, type Brand } from "@/server/db/schema";

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
  campaignId: string;
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
      candidateId === input.campaignId &&
      zernioConnectionMatchesPlatform("meta", platform) &&
      typeof accountId === "string" &&
      allowed.some((allowedAccount) =>
        sameAdAccountId("meta", allowedAccount.externalId, accountId),
      )
    );
  });
  if (!campaign) {
    throw new Error(
      `Meta campaign ${input.campaignId} is outside ${brand.name}'s allowed accounts`,
    );
  }
  const provider = await duplicateZernioMetaCampaign(
    input.campaignId,
    { renameSuffix: input.renameSuffix },
    {
      idempotencyKey: idempotencyKey(
        { organizationId: input.organizationId, runId: input.runId },
        "duplicate-meta",
        { campaignId: input.campaignId, renameSuffix: input.renameSuffix },
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
  return {
    brand: destination.brand,
    adAccount: destination.adAccount,
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
