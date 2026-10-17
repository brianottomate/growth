import "server-only";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  adAccountTable,
  audienceTable,
  brandTable,
  campaignAudienceAssetTable,
  channelTable,
  platformAudienceTable,
  seedListTable,
} from "@/server/db/schema";
import {
  addUsersToZernioAdAudience,
  getZernioAdAudience,
  listZernioAdAudiences,
} from "@/server/clients/zernio.client";
import { seedUsesWanderData, type SeedDefinition } from "@/lib/seed-definition";
import { requireMetaAudienceAccount } from "../audience-account";
import {
  createAdAudience,
  listAdsWriteDestinations,
} from "../ads-write.service";
import { linkPlatformAudience } from "../ads-draft.service";
import { assignPersonaAudience } from "../persona-audience.service";
import { pickSeedDestination, sameMetaAccount } from "./upload-batches";
import {
  requireSeedBrand,
  requireSeedList,
  requireWanderSeedSource,
  seedListSummary,
  seedWarning,
  type SeedActor,
} from "./service";

type DeliveryActor = SeedActor & { runId: string };
type Asset = typeof platformAudienceTable.$inferSelect;
export type SeedTarget = { type: "campaign_audience" | "persona"; id: string };
type SeedBrand = { id: string; slug: string | null; name: string };

const WANDER_BRAND_SLUG = "wander";
const UPLOAD_BATCH = 10_000;

async function requireWanderBrand(actor: SeedActor) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.organizationId, actor.organizationId),
      eq(brandTable.slug, WANDER_BRAND_SLUG),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand)
    throw new Error("The Wander brand is missing from this workspace");
  return brand;
}

/**
 * The brand whose Meta account holds a list's assets. Wander's customers stay
 * in Wander's account and reach the client as a shared lookalike; a list of the
 * brand's own people goes straight to the brand's account.
 */
async function seedOwner(
  definition: SeedDefinition | null,
  brand: SeedBrand,
  actor: SeedActor,
): Promise<SeedBrand> {
  return seedUsesWanderData(definition) ? requireWanderBrand(actor) : brand;
}

async function seedDestination(owner: SeedBrand, actor: SeedActor) {
  if (!owner.slug) throw new Error(`${owner.name} has no brand slug`);
  const [listed, allowed] = await Promise.all([
    listAdsWriteDestinations({
      organizationId: actor.organizationId,
      brandSlug: owner.slug,
      platform: "meta",
    }),
    db.query.adAccountTable.findMany({
      where: and(
        eq(adAccountTable.brandId, owner.id),
        eq(adAccountTable.platform, "facebook"),
        eq(adAccountTable.isAllowed, true),
      ),
      columns: { id: true, brandId: true, externalId: true },
    }),
  ]);
  return pickSeedDestination({ owner, listed: listed.destinations, allowed });
}

/**
 * Meta refuses custom audiences until the Meta user behind the connection has
 * accepted the custom audience terms for that account (subcode 1870090). A
 * retry cannot succeed, so stop with the one action that fixes it.
 */
async function createSeedAudience(
  input: Parameters<typeof createAdAudience>[0],
  actor: DeliveryActor,
) {
  try {
    return await createAdAudience(input, actor);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("1870090")) throw error;
    const act = input.adAccountId.replace(/^act_/, "");
    throw new Error(
      `Meta has not accepted the custom audience terms for ad account ${act}. The Meta user behind Zernio connection ${input.connectionAccountId} must accept them at https://business.facebook.com/ads/manage/customaudiences/tos/?act=${act}, then run this step again. No audience was created.`,
    );
  }
}

const providerId = (asset: Asset) => {
  const record = asset.definition as { id?: string; _id?: string } | null;
  const id = record?.id ?? record?._id;
  if (!id) throw new Error(`Audience ${asset.id} has no provider record ID`);
  return id;
};

/** A list's assets live under its owner brand; never trust a caller's brand id. */
async function requireSeedAsset(
  id: string,
  seedListId: string,
  owner: SeedBrand,
) {
  const asset = await db.query.platformAudienceTable.findFirst({
    where: and(
      eq(platformAudienceTable.id, id),
      eq(platformAudienceTable.brandId, owner.id),
      eq(platformAudienceTable.seedListId, seedListId),
    ),
  });
  if (!asset)
    throw new Error("This Meta list was not uploaded from that seed list");
  return asset;
}

// Zernio answers { message, numReceived } and names rejected rows only when
// there are any.
const acknowledgment = z.object({
  numReceived: z.number().int().nonnegative(),
  numInvalid: z.number().int().nonnegative().optional(),
});

/**
 * Create a Meta customer list from the seed list and send everyone with an
 * email or phone. One pass: on any failure the list is marked failed and the
 * operator uploads again, which creates a new Meta list.
 */
export async function uploadSeed(
  input: { seedListId: string; name?: string; approved: true },
  actor: DeliveryActor,
) {
  if (input.approved !== true) throw new Error("Approve the seed upload first");
  const { list, brand } = await requireSeedList(input.seedListId, actor);
  if (seedUsesWanderData(list.definition)) await requireWanderSeedSource(actor);
  const users = list.members.flatMap((m) =>
    m.email || m.phone
      ? [
          {
            ...(m.email ? { email: m.email } : {}),
            ...(m.phone ? { phone: m.phone } : {}),
          },
        ]
      : [],
  );
  if (!users.length)
    throw new Error("Nobody on this list has an email or phone to upload");
  const owner = await seedOwner(list.definition, brand, actor);
  const target = await seedDestination(owner, actor);
  const created = await createSeedAudience(
    {
      brandSlug: owner.slug!,
      connectionAccountId: target.connectionAccountId,
      adAccountId: target.adAccountId,
      type: "customer_list",
      seedListId: list.id,
      forBrandId: brand.id,
      name: input.name?.trim() || `${brand.name} · ${list.name}`,
    },
    actor,
  );
  if (!created.platformAudienceId)
    throw new Error("Meta list created without a local record");
  const asset = await db.query.platformAudienceTable.findFirst({
    where: eq(platformAudienceTable.id, created.platformAudienceId),
  });
  const mark = (status: "ready" | "failed") =>
    db
      .update(platformAudienceTable)
      .set({ seedMetadata: { count: users.length, status } })
      .where(eq(platformAudienceTable.id, created.platformAudienceId!));
  try {
    const record = providerId(asset!);
    for (let i = 0; i < users.length; i += UPLOAD_BATCH) {
      const batch = users.slice(i, i + UPLOAD_BATCH);
      const ack = acknowledgment.safeParse(
        await addUsersToZernioAdAudience(record, batch),
      );
      if (!ack.success || ack.data.numReceived !== batch.length)
        throw new Error(
          `Meta acknowledged ${ack.success ? ack.data.numReceived : "none"} of ${batch.length} in a batch`,
        );
    }
    await mark("ready");
  } catch (error) {
    await mark("failed");
    throw new Error(
      `Upload failed: ${error instanceof Error ? error.message : "unknown error"}. Meta list ${asset?.externalId ?? created.platformAudienceId} may be partly filled; delete it in Ads Manager and upload again.`,
    );
  }
  return {
    platformAudienceId: created.platformAudienceId,
    adAccountId: target.adAccountId,
    uploaded: users.length,
    warning: seedWarning(users.length),
  };
}

export async function seedAssetStatus(
  input: { seedListId: string; platformAudienceId: string },
  actor: SeedActor,
) {
  const { list, brand } = await requireSeedList(input.seedListId, actor);
  const asset = await requireSeedAsset(
    input.platformAudienceId,
    list.id,
    await seedOwner(list.definition, brand, actor),
  );
  await requireMetaAudienceAccount(asset);
  const provider = await getZernioAdAudience(providerId(asset));
  const size = provider.audience?.size ?? provider.audience?.approximateCount;
  return {
    platformAudienceId: asset.id,
    uploadStatus: asset.seedMetadata?.status ?? null,
    providerStatus: provider.audience?.status ?? null,
    matchedSize: typeof size === "number" ? size : null,
  };
}

const adsManagerAudiencesUrl = (adAccountId: string) =>
  `https://adsmanager.facebook.com/adsmanager/audiences?act=${adAccountId.replace(/^act_/, "")}`;

/** The client's own Meta account: its brand's pinned, allowlisted destination. */
async function clientAccount(brandId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: { id: true, name: true, slug: true, performanceSettings: true },
  });
  if (!brand) throw new Error("Client brand not found");
  const pinned = brand.performanceSettings?.metaAdsDestination;
  const local = pinned
    ? (
        await db.query.adAccountTable.findMany({
          where: and(
            eq(adAccountTable.brandId, brand.id),
            eq(adAccountTable.platform, "facebook"),
            eq(adAccountTable.isAllowed, true),
          ),
        })
      ).find((a) => sameMetaAccount(a.externalId, pinned.adAccountId))
    : undefined;
  return { brand, pinned: local ? pinned! : null, local: local ?? null };
}

/** Everything an operator needs to share a lookalike from Wander's account by hand. */
async function seedShare(lookalike: Asset, seedListId: string) {
  if (!lookalike.forBrandId)
    throw new Error("This lookalike was not built for a client brand");
  const [source, client, seed] = await Promise.all([
    requireMetaAudienceAccount(lookalike),
    clientAccount(lookalike.forBrandId),
    lookalike.parentPlatformAudienceId
      ? db.query.platformAudienceTable.findFirst({
          where: eq(
            platformAudienceTable.id,
            lookalike.parentPlatformAudienceId,
          ),
          columns: { id: true, name: true, externalId: true },
        })
      : undefined,
  ]);
  const mirror =
    client.local && lookalike.externalId
      ? await db.query.platformAudienceTable.findFirst({
          where: and(
            eq(platformAudienceTable.brandId, client.brand.id),
            eq(platformAudienceTable.adAccountId, client.local.id),
            eq(platformAudienceTable.externalId, lookalike.externalId),
          ),
          columns: { id: true, createdAt: true },
        })
      : undefined;
  return {
    seedListId,
    platformAudienceId: lookalike.id,
    lookalikeName: lookalike.name,
    metaAudienceId: lookalike.externalId,
    seedPlatformAudienceId: seed?.id ?? null,
    seedName: seed?.name ?? null,
    seedMetaAudienceId: seed?.externalId ?? null,
    sourceAdAccountId: source.externalId,
    adsManagerUrl: adsManagerAudiencesUrl(source.externalId),
    clientBrandId: client.brand.id,
    clientBrandName: client.brand.name,
    clientAdAccountId: client.local?.externalId ?? null,
    clientAdAccountName: client.local?.name ?? null,
    status: !client.local
      ? ("no_client_account" as const)
      : mirror
        ? ("shared" as const)
        : ("not_shared" as const),
    sharedPlatformAudienceId: mirror?.id ?? null,
    sharedAt: mirror?.createdAt.toISOString() ?? null,
  };
}
export type SeedShare = Awaited<ReturnType<typeof seedShare>>;

export async function seedLookalike(
  input: {
    seedListId: string;
    seedPlatformAudienceId: string;
    country: string;
    ratio: number;
    approved: true;
  },
  actor: DeliveryActor,
) {
  if (input.approved !== true)
    throw new Error("Approve lookalike creation first");
  const { list, brand } = await requireSeedList(input.seedListId, actor);
  const owner = await seedOwner(list.definition, brand, actor);
  const seed = await requireSeedAsset(
    input.seedPlatformAudienceId,
    list.id,
    owner,
  );
  if (!seed.externalId || seed.seedMetadata?.status !== "ready")
    throw new Error("Upload this seed list to Meta first");
  const target = await seedDestination(owner, actor);
  const status = (await getZernioAdAudience(providerId(seed))).audience?.status;
  if (status === "pending" || status === "processing")
    throw new Error(
      "Meta is still processing the uploaded list; try the lookalike again in a few minutes",
    );
  const created = await createSeedAudience(
    {
      brandSlug: owner.slug!,
      connectionAccountId: target.connectionAccountId,
      adAccountId: target.adAccountId,
      type: "lookalike",
      name: `${seed.name} · ${Math.round(input.ratio * 100)}% ${input.country}`,
      sourceAudienceId: seed.externalId,
      parentPlatformAudienceId: seed.id,
      forBrandId: brand.id,
      country: input.country,
      ratio: input.ratio,
    },
    actor,
  );
  if (!created.platformAudienceId)
    throw new Error("Lookalike created without a local record");
  const lookalike = await db.query.platformAudienceTable.findFirst({
    where: eq(platformAudienceTable.id, created.platformAudienceId),
  });
  return {
    platformAudienceId: created.platformAudienceId,
    parentPlatformAudienceId: seed.id,
    share: await seedShare(lookalike!, list.id),
  };
}

async function requireDeliveredLookalike(
  id: string,
  seedListId: string,
  owner: SeedBrand,
) {
  const lookalike = await db.query.platformAudienceTable.findFirst({
    where: and(
      eq(platformAudienceTable.id, id),
      eq(platformAudienceTable.brandId, owner.id),
    ),
  });
  const parent = lookalike?.parentPlatformAudienceId
    ? await db.query.platformAudienceTable.findFirst({
        where: eq(platformAudienceTable.id, lookalike.parentPlatformAudienceId),
        columns: { seedListId: true },
      })
    : null;
  if (!lookalike || parent?.seedListId !== seedListId)
    throw new Error("Choose a lookalike built from this seed list");
  return lookalike;
}

/**
 * Sharing happens in Ads Manager. Detection reads the client account's
 * audiences through Zernio; when Meta lists the lookalike there, or the
 * operator confirms the share, the client account gets its own mirror row,
 * which is what the client's campaigns and personas target.
 */
export async function shareSeedLookalike(
  input: {
    seedListId: string;
    platformAudienceId: string;
    confirmShared?: boolean;
    target?: SeedTarget;
  },
  actor: SeedActor,
) {
  const { list, brand } = await requireSeedList(input.seedListId, actor);
  const lookalike = await requireDeliveredLookalike(
    input.platformAudienceId,
    list.id,
    await seedOwner(list.definition, brand, actor),
  );
  if (lookalike.forBrandId !== brand.id)
    throw new Error("This lookalike was built for a different brand");
  let share = await seedShare(lookalike, list.id);
  if (share.status === "no_client_account")
    throw new Error(
      `${brand.name} has no pinned, allowlisted Meta ad account to share with. Set its Meta destination on the brand page first.`,
    );
  let detected: "provider" | "operator" | "same_account" | null = null;
  if (share.status === "not_shared") {
    const client = await clientAccount(brand.id);
    const found = sameMetaAccount(
      client.local!.externalId,
      share.sourceAdAccountId,
    )
      ? "same_account"
      : (
          await listZernioAdAudiences({
            accountId: client.pinned!.connectionAccountId,
            adAccountId: client.pinned!.adAccountId,
          })
        ).find(
          (a) =>
            a.platformAudienceId === lookalike.externalId ||
            a.id === lookalike.externalId,
        );
    if (found || input.confirmShared) {
      detected =
        found === "same_account"
          ? "same_account"
          : found
            ? "provider"
            : "operator";
      const channel = await db.query.channelTable.findFirst({
        where: and(
          eq(channelTable.brandId, brand.id),
          eq(channelTable.platform, "meta_ads"),
          isNull(channelTable.deletedAt),
        ),
        columns: { id: true },
      });
      if (!channel)
        throw new Error(
          `${brand.name} has no Meta Ads channel to hold the audience`,
        );
      await db
        .insert(platformAudienceTable)
        .values({
          channelId: channel.id,
          brandId: brand.id,
          adAccountId: client.local!.id,
          name: lookalike.name,
          type: "lookalike",
          source: "lookalike_seed",
          externalId: lookalike.externalId,
          sourceId: lookalike.sourceId,
          definition: typeof found === "object" ? found : lookalike.definition,
        })
        .onConflictDoNothing();
      share = await seedShare(lookalike, list.id);
    }
  }
  if (share.status === "shared" && input.target)
    await attachSeedAsset(
      {
        seedListId: list.id,
        platformAudienceId: share.sharedPlatformAudienceId!,
        target: input.target,
      },
      actor,
    );
  return {
    ...share,
    detected,
    attached: share.status === "shared" && !!input.target,
    next:
      share.status === "shared"
        ? null
        : `Not visible in ${share.clientAdAccountId} yet. In Ads Manager (${share.adsManagerUrl}) share audience ${share.metaAudienceId} with ${share.clientAdAccountId}, then check again; pass confirmShared if Meta still does not list it.`,
  };
}

export async function attachSeedAsset(
  input: { seedListId: string; platformAudienceId: string; target: SeedTarget },
  actor: SeedActor,
) {
  const { list, brand } = await requireSeedList(input.seedListId, actor);
  const asset = await db.query.platformAudienceTable.findFirst({
    where: and(
      eq(platformAudienceTable.id, input.platformAudienceId),
      eq(platformAudienceTable.brandId, brand.id),
    ),
  });
  if (!asset) throw new Error("Platform audience not found on this brand");
  // A client targets its own account's copy of the lookalike; its lineage is
  // the Wander-side lookalike with the same Meta ID, built from this list.
  const delivered = asset.externalId
    ? await db.query.platformAudienceTable.findMany({
        where: and(
          eq(platformAudienceTable.externalId, asset.externalId),
          eq(platformAudienceTable.forBrandId, brand.id),
        ),
        columns: { parentPlatformAudienceId: true },
      })
    : [];
  const parentIds = [asset, ...delivered].flatMap((a) =>
    a.parentPlatformAudienceId ? [a.parentPlatformAudienceId] : [],
  );
  const parents = parentIds.length
    ? await db.query.platformAudienceTable.findMany({
        where: inArray(platformAudienceTable.id, parentIds),
      })
    : [];
  const seed = [asset, ...parents].find((a) => a.seedListId === list.id);
  if (seed?.seedMetadata?.status !== "ready")
    throw new Error(
      "Choose an uploaded seed, its lookalike, or the client's shared copy from this list",
    );
  await requireMetaAudienceAccount(asset);
  if (input.target.type === "campaign_audience")
    await linkPlatformAudience({
      platformAudienceId: asset.id,
      audienceId: input.target.id,
      organizationId: actor.organizationId,
    });
  else
    await assignPersonaAudience({
      platformAudienceId: asset.id,
      personaId: input.target.id,
      organizationId: actor.organizationId,
    });
  return { platformAudienceId: asset.id, attached: true };
}

export type SeedDeliveryStage =
  | "built"
  | "uploaded"
  | "failed"
  | "lookalike"
  | "shared";

/**
 * Where each seed list stands on the way to a client's ad account: its Meta
 * customer list, the lookalike, and the share. DB only, so it can list every
 * brand at once.
 */
export async function listSeedDeliveries(
  input: { brandId?: string; campaignAudienceId?: string },
  actor: SeedActor,
) {
  if (input.brandId) await requireSeedBrand(input.brandId, actor);
  const [linked] = input.campaignAudienceId
    ? await db
        .select({ id: campaignAudienceAssetTable.platformAudienceId })
        .from(campaignAudienceAssetTable)
        .innerJoin(
          audienceTable,
          eq(audienceTable.id, campaignAudienceAssetTable.audienceId),
        )
        .innerJoin(brandTable, eq(brandTable.id, audienceTable.brandId))
        .where(
          and(
            eq(campaignAudienceAssetTable.audienceId, input.campaignAudienceId),
            eq(campaignAudienceAssetTable.platform, "meta_ads"),
            eq(brandTable.organizationId, actor.organizationId),
          ),
        )
        .limit(1)
    : [];
  const lists = await db
    .select({
      list: {
        id: seedListTable.id,
        brandId: seedListTable.brandId,
        name: seedListTable.name,
        origin: seedListTable.origin,
        definition: seedListTable.definition,
        memberCount: seedListTable.memberCount,
        summary: seedListTable.summary,
        builtAt: seedListTable.builtAt,
        createdAt: seedListTable.createdAt,
        updatedAt: seedListTable.updatedAt,
      },
      brandName: brandTable.name,
      brandSlug: brandTable.slug,
    })
    .from(seedListTable)
    .innerJoin(brandTable, eq(brandTable.id, seedListTable.brandId))
    .where(
      and(
        eq(brandTable.organizationId, actor.organizationId),
        isNull(brandTable.deletedAt),
        ...(input.brandId ? [eq(brandTable.id, input.brandId)] : []),
      ),
    )
    .orderBy(desc(seedListTable.updatedAt));
  if (!lists.length) return [];
  const seeds = await db.query.platformAudienceTable.findMany({
    where: inArray(
      platformAudienceTable.seedListId,
      lists.map((l) => l.list.id),
    ),
    orderBy: desc(platformAudienceTable.createdAt),
  });
  const lookalikes = seeds.length
    ? await db.query.platformAudienceTable.findMany({
        where: and(
          inArray(
            platformAudienceTable.parentPlatformAudienceId,
            seeds.map((s) => s.id),
          ),
          isNotNull(platformAudienceTable.forBrandId),
        ),
        orderBy: desc(platformAudienceTable.createdAt),
      })
    : [];
  return Promise.all(
    lists.map(async ({ list, brandName, brandSlug }) => {
      const own = seeds.filter((a) => a.seedListId === list.id);
      // The latest successful upload, else the latest attempt.
      const seed =
        own.find((a) => a.seedMetadata?.status === "ready") ?? own[0];
      const lookalike = seed
        ? lookalikes.find((l) => l.parentPlatformAudienceId === seed.id)
        : undefined;
      const share = lookalike ? await seedShare(lookalike, list.id) : null;
      const stage: SeedDeliveryStage =
        share?.status === "shared"
          ? "shared"
          : lookalike
            ? "lookalike"
            : seed?.seedMetadata?.status === "ready"
              ? "uploaded"
              : seed?.seedMetadata?.status === "failed"
                ? "failed"
                : "built";
      return {
        ...seedListSummary(list),
        brandName,
        brandSlug,
        wanderData: seedUsesWanderData(list.definition),
        stage,
        seed: seed
          ? {
              platformAudienceId: seed.id,
              name: seed.name,
              metaAudienceId: seed.externalId,
              status: seed.seedMetadata?.status ?? null,
              entries: seed.seedMetadata?.count ?? null,
            }
          : null,
        lookalike: lookalike
          ? {
              platformAudienceId: lookalike.id,
              name: lookalike.name,
              metaAudienceId: lookalike.externalId,
              sizeLabel: lookalike.sizeLabel,
            }
          : null,
        share,
        linkedToCampaignAudience:
          !!linked && linked.id === share?.sharedPlatformAudienceId,
      };
    }),
  );
}
export type SeedDelivery = Awaited<
  ReturnType<typeof listSeedDeliveries>
>[number];
