import { requireMetaAudienceAccount } from "../audience-account";
import {
  pickSeedDestination,
  sameMetaAccount,
  uploadSeedBatches,
  SeedAcknowledgmentError,
  type SeedUploadUser,
} from "./upload-batches";
import { z } from "zod";
import "server-only";
import {
  and,
  asc,
  count,
  eq,
  gt,
  isNull,
  inArray,
  or,
  isNotNull,
  desc,
} from "drizzle-orm";
import { db } from "@/server/db";
import {
  adAccountTable,
  audienceTable,
  brandTable,
  campaignAudienceAssetTable,
  channelTable,
  platformAudienceTable,
  seedListTable,
  seedMemberTable,
  seedSnapshotTable,
} from "@/server/db/schema";
import {
  addUsersToZernioAdAudience,
  getZernioAdAudience,
  listZernioAdAudiences,
} from "@/server/clients/zernio.client";
import {
  createAdAudience,
  listAdsWriteDestinations,
} from "../ads-write.service";
import { linkPlatformAudience } from "../ads-draft.service";
import { assignPersonaAudience } from "../persona-audience.service";
import {
  readSeed,
  requireSeedBrand,
  requireSeedSnapshot,
  seedSnapshotSummary,
  requireWanderSeedSource,
  type SeedActor,
} from "./service";
import {
  SEED_GUIDELINE_ENTRIES,
  seedOriginLabel,
  seedUsesWanderData,
  type SeedSource,
} from "@/lib/seed-definition";

type DeliveryActor = SeedActor & { runId: string };
type Asset = typeof platformAudienceTable.$inferSelect;
export type SeedTarget = { type: "campaign_audience" | "persona"; id: string };

const WANDER_BRAND_SLUG = "wander";

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

type SeedBrand = { id: string; slug: string | null; name: string };

/**
 * The brand whose Meta account holds a snapshot's assets. Wander's customers
 * stay in Wander's account and reach the client as a shared lookalike; a seed
 * of the brand's own people goes straight to the brand's account.
 */
async function seedOwner(
  source: SeedSource,
  brand: SeedBrand,
  actor: SeedActor,
): Promise<SeedBrand> {
  return seedUsesWanderData(source) ? requireWanderBrand(actor) : brand;
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
  return {
    owner,
    ...pickSeedDestination({
      owner,
      listed: listed.destinations,
      allowed,
    }),
  };
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
      `Meta has not accepted the custom audience terms for ad account ${act}. The Meta user behind Zernio connection ${input.connectionAccountId} must accept them at https://business.facebook.com/ads/manage/customaudiences/tos/?act=${act}, then run this step again. No audience was created; do not retry before the terms are accepted.`,
    );
  }
}

const providerId = (asset: Asset) => {
  const record = asset.definition as { id?: string; _id?: string } | null;
  const id = record?.id ?? record?._id;
  if (!id)
    throw new Error(
      `Audience ${asset.id} has no provider record ID; inspect before retrying`,
    );
  return id;
};
const identifiable = or(
  isNotNull(seedMemberTable.email),
  isNotNull(seedMemberTable.phone),
);
async function uploadableEntries(snapshotId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(seedMemberTable)
    .where(and(eq(seedMemberTable.snapshotId, snapshotId), identifiable));
  return row?.n ?? 0;
}
async function matchedSize(asset: Asset) {
  const provider = await getZernioAdAudience(providerId(asset)).catch(
    () => null,
  );
  const size = provider?.audience?.size ?? provider?.audience?.approximateCount;
  return typeof size === "number" ? size : null;
}

/** A snapshot's assets live under its owner brand; never trust a caller's brand id. */
async function requireSeedAsset(
  id: string,
  snapshotId: string,
  owner: SeedBrand,
) {
  const asset = await db.query.platformAudienceTable.findFirst({
    where: and(
      eq(platformAudienceTable.id, id),
      eq(platformAudienceTable.brandId, owner.id),
      eq(platformAudienceTable.seedSnapshotId, snapshotId),
    ),
  });
  if (!asset) throw new Error("Seed asset not found on this snapshot");
  return asset;
}

/** Never auto-retry creation. Resume a known local asset instead; uploads are additive. */
export async function uploadSeed(
  input: {
    snapshotId: string;
    platformAudienceId?: string;
    name?: string;
    approved: true;
  },
  actor: DeliveryActor,
) {
  if (input.approved !== true) throw new Error("Approve the seed upload first");
  const { snapshot, brand, list } = await requireSeedSnapshot(
    input.snapshotId,
    actor,
  );
  if (seedUsesWanderData(snapshot.definition))
    await requireWanderSeedSource(actor);
  const entries = await uploadableEntries(snapshot.id);
  if (!entries)
    throw new Error(
      `None of ${snapshot.memberCount} members has an email or phone.${snapshot.diagnostics.contacts ? "" : " This build predates stored contacts: rebuild the list first."}`,
    );
  const warning =
    entries < SEED_GUIDELINE_ENTRIES
      ? `${entries} ${entries === 1 ? "entry" : "entries"}; Meta usually needs about ${SEED_GUIDELINE_ENTRIES.toLocaleString("en-US")} for a useful lookalike.`
      : null;
  const owner = await seedOwner(snapshot.definition, brand, actor);
  const target = await seedDestination(owner, actor);
  let asset = input.platformAudienceId
    ? await requireSeedAsset(input.platformAudienceId, snapshot.id, owner)
    : null;
  if (
    asset &&
    (asset.adAccountId !== target.localAdAccountId ||
      asset.source !== "customer_list" ||
      asset.forBrandId !== brand.id)
  )
    throw new Error(
      `Resume an audience created from this snapshot in ${owner.name}'s ad account`,
    );
  if (asset && asset.seedMetadata?.count !== entries)
    throw new Error(
      `This upload began with ${asset.seedMetadata?.count} entries and the snapshot now has ${entries}; compile a new snapshot instead of resuming`,
    );
  if (asset?.seedMetadata?.status === "ready")
    return {
      platformAudienceId: asset.id,
      adAccountId: target.adAccountId,
      uploaded: asset.seedMetadata.uploadedCount ?? entries,
      entries,
      memberCount: snapshot.memberCount,
      matchedSize: await matchedSize(asset),
      warning,
    };
  if (!asset) {
    const created = await createSeedAudience(
      {
        brandSlug: owner.slug!,
        connectionAccountId: target.connectionAccountId,
        adAccountId: target.adAccountId,
        type: "customer_list",
        seedSnapshotId: snapshot.id,
        forBrandId: brand.id,
        name:
          input.name?.trim() || `${brand.name} · ${list.name} · ${snapshot.id}`,
      },
      actor,
    );
    if (!created.platformAudienceId)
      throw new Error(
        "Provider audience created without a local record. Inspect the provider before retrying.",
      );
    [asset = null] = await db
      .update(platformAudienceTable)
      .set({
        seedMetadata: {
          source: "seed",
          count: entries,
          uploadedCount: 0,
          status: "uploading",
        },
      })
      .where(eq(platformAudienceTable.id, created.platformAudienceId))
      .returning();
    if (!asset)
      throw new Error(
        `Seed ${created.platformAudienceId} was created; inspect it before retrying`,
      );
  }
  const audience = asset;
  const record = providerId(audience);
  let uploaded = audience.seedMetadata?.uploadedCount ?? 0;
  const mark = (status: "uploading" | "ready" | "failed") =>
    db
      .update(platformAudienceTable)
      .set({
        seedMetadata: {
          source: "seed",
          count: entries,
          uploadedCount: uploaded,
          status,
        },
      })
      .where(eq(platformAudienceTable.id, audience.id));
  try {
    await uploadSeedBatches({
      alreadyUploaded: uploaded,
      page: async (afterHash) => {
        const rows = await db
          .select({
            emailHash: seedMemberTable.emailHash,
            email: seedMemberTable.email,
            phone: seedMemberTable.phone,
          })
          .from(seedMemberTable)
          .where(
            and(
              eq(seedMemberTable.snapshotId, snapshot.id),
              identifiable,
              ...(afterHash ? [gt(seedMemberTable.emailHash, afterHash)] : []),
            ),
          )
          .orderBy(asc(seedMemberTable.emailHash))
          .limit(10000);
        return {
          users: rows.map((r): SeedUploadUser => ({
            ...(r.email ? { email: r.email } : {}),
            ...(r.phone ? { phone: r.phone } : {}),
          })),
          nextAfterHash: rows.length === 10000 ? rows.at(-1)!.emailHash : null,
        };
      },
      send: (users) => addUsersToZernioAdAudience(record, users),
      progress: async (n) => {
        uploaded = n;
        await mark("uploading");
      },
    });
    await mark("ready");
  } catch (error) {
    await mark("failed");
    throw new Error(
      `${error instanceof SeedAcknowledgmentError ? error.message + " " : ""}Upload stopped after ${uploaded}/${entries} confirmed entries. Resume platformAudienceId ${audience.id}; do not create another audience. No lookalike was made.`,
    );
  }
  return {
    platformAudienceId: audience.id,
    adAccountId: target.adAccountId,
    uploaded,
    entries,
    memberCount: snapshot.memberCount,
    matchedSize: await matchedSize(audience),
    warning,
  };
}

export async function seedAssetStatus(
  input: { snapshotId: string; platformAudienceId: string },
  actor: SeedActor,
) {
  const { snapshot, brand } = await requireSeedSnapshot(
    input.snapshotId,
    actor,
  );
  const asset = await requireSeedAsset(
    input.platformAudienceId,
    snapshot.id,
    await seedOwner(snapshot.definition, brand, actor),
  );
  // Recheck allowlisting even for reads; permission may have changed after upload.
  await requireMetaAudienceAccount(asset);
  const provider = await getZernioAdAudience(providerId(asset));
  const size = provider.audience?.size ?? provider.audience?.approximateCount;
  return {
    platformAudienceId: asset.id,
    sourceCount: snapshot.memberCount,
    entries: asset.seedMetadata?.count ?? null,
    uploadStatus: asset.seedMetadata?.status ?? null,
    matchedSize: typeof size === "number" ? size : null,
    provider: provider.audience
      ? z.record(z.string(), z.json()).parse(provider.audience)
      : null,
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
async function seedShare(lookalike: Asset, snapshotId: string) {
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
    snapshotId,
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
    snapshotId: string;
    seedPlatformAudienceId: string;
    country: string;
    ratio: number;
    approved: true;
  },
  actor: DeliveryActor,
) {
  if (input.approved !== true)
    throw new Error("Approve lookalike creation first");
  const { snapshot, brand } = await requireSeedSnapshot(
    input.snapshotId,
    actor,
  );
  const owner = await seedOwner(snapshot.definition, brand, actor);
  const seed = await requireSeedAsset(
    input.seedPlatformAudienceId,
    snapshot.id,
    owner,
  );
  if (
    !seed.externalId ||
    seed.source !== "customer_list" ||
    seed.seedMetadata?.status !== "ready"
  )
    throw new Error(
      "Choose a fully uploaded customer-list asset for this snapshot",
    );
  const target = await seedDestination(owner, actor);
  if (seed.adAccountId !== target.localAdAccountId)
    throw new Error(`This seed is not in ${owner.name}'s ad account`);
  const status = (await getZernioAdAudience(providerId(seed))).audience?.status;
  if (status === "pending" || status === "processing")
    throw new Error(
      "Meta is still processing this seed; check status again before creating a lookalike",
    );
  // Meta's own error (e.g. an unsupported country) surfaces as thrown.
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
    throw new Error(
      "Lookalike created without a local record; inspect before retrying",
    );
  const lookalike = await db.query.platformAudienceTable.findFirst({
    where: eq(platformAudienceTable.id, created.platformAudienceId),
  });
  return {
    platformAudienceId: created.platformAudienceId,
    parentPlatformAudienceId: seed.id,
    share: await seedShare(lookalike!, snapshot.id),
  };
}

async function requireDeliveredLookalike(
  id: string,
  snapshotId: string,
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
        columns: { seedSnapshotId: true },
      })
    : null;
  if (!lookalike || parent?.seedSnapshotId !== snapshotId)
    throw new Error("Choose a lookalike built from this snapshot");
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
    snapshotId: string;
    platformAudienceId: string;
    confirmShared?: boolean;
    target?: SeedTarget;
  },
  actor: SeedActor,
) {
  const { snapshot, brand } = await requireSeedSnapshot(
    input.snapshotId,
    actor,
  );
  const lookalike = await requireDeliveredLookalike(
    input.platformAudienceId,
    snapshot.id,
    await seedOwner(snapshot.definition, brand, actor),
  );
  if (lookalike.forBrandId !== brand.id)
    throw new Error("This lookalike was built for a different brand");
  let share = await seedShare(lookalike, snapshot.id);
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
      share = await seedShare(lookalike, snapshot.id);
    }
  }
  if (share.status === "shared" && input.target)
    await attachSeedAsset(
      {
        snapshotId: snapshot.id,
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

/** readSeed plus each delivered lookalike's share state; DB only. */
export async function readSeedDelivery(
  input: { seedListId: string },
  actor: SeedActor,
) {
  const read = await readSeed(input, actor);
  const seedSnapshot = new Map(
    read.assets.flatMap((a) =>
      a.seedSnapshotId ? [[a.id, a.seedSnapshotId] as const] : [],
    ),
  );
  const lookalikes = read.assets.filter(
    (a) =>
      a.parentPlatformAudienceId &&
      seedSnapshot.has(a.parentPlatformAudienceId),
  );
  const rows = lookalikes.length
    ? await db.query.platformAudienceTable.findMany({
        where: inArray(
          platformAudienceTable.id,
          lookalikes.map((l) => l.id),
        ),
      })
    : [];
  const shares = await Promise.all(
    rows
      .filter((r) => r.forBrandId)
      .map((r) => seedShare(r, seedSnapshot.get(r.parentPlatformAudienceId!)!)),
  );
  return { ...read, shares };
}

export async function attachSeedAsset(
  input: {
    snapshotId: string;
    platformAudienceId: string;
    target: SeedTarget;
  },
  actor: SeedActor,
) {
  const { snapshot, brand } = await requireSeedSnapshot(
    input.snapshotId,
    actor,
  );
  const asset = await db.query.platformAudienceTable.findFirst({
    where: and(
      eq(platformAudienceTable.id, input.platformAudienceId),
      eq(platformAudienceTable.brandId, brand.id),
    ),
  });
  if (!asset) throw new Error("Platform audience not found on this brand");
  // A client targets its own account's copy of the lookalike; its lineage is
  // the Wander-side lookalike with the same Meta ID, built from this snapshot.
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
  const seed = [asset, ...parents].find(
    (a) => a.seedSnapshotId === snapshot.id,
  );
  if (seed?.seedMetadata?.status !== "ready")
    throw new Error(
      "Choose an uploaded seed, its lookalike, or the client's shared copy from this snapshot",
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
  | "not_built"
  | "built"
  | "uploading"
  | "uploaded"
  | "lookalike"
  | "shared";

/**
 * Where each seed list stands on the way to a client's ad account: its active
 * build (the uploaded one, else the newest), Wander's customer list, the
 * lookalike, and the share. DB only, so it can list every brand at once.
 */
export async function listSeedDeliveries(
  input: { brandId?: string; campaignAudienceId?: string },
  actor: SeedActor,
) {
  if (input.brandId) await requireSeedBrand(input.brandId, actor);
  // Which Meta asset this campaign audience's ad sets target, if asked.
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
      id: seedListTable.id,
      name: seedListTable.name,
      origin: seedListTable.origin,
      brandId: brandTable.id,
      brandName: brandTable.name,
      brandSlug: brandTable.slug,
      updatedAt: seedListTable.updatedAt,
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
  const snapshots = await db.query.seedSnapshotTable.findMany({
    where: inArray(
      seedSnapshotTable.seedListId,
      lists.map((l) => l.id),
    ),
    orderBy: desc(seedSnapshotTable.createdAt),
  });
  const seeds = snapshots.length
    ? await db.query.platformAudienceTable.findMany({
        where: inArray(
          platformAudienceTable.seedSnapshotId,
          snapshots.map((s) => s.id),
        ),
        orderBy: desc(platformAudienceTable.createdAt),
      })
    : [];
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
    lists.map(async (list) => {
      const own = snapshots.filter((s) => s.seedListId === list.id);
      const seed = seeds.find((a) =>
        own.some((s) => s.id === a.seedSnapshotId),
      );
      const snapshot =
        own.find((s) => s.id === seed?.seedSnapshotId) ?? own[0] ?? null;
      const lookalike = seed
        ? lookalikes.find((l) => l.parentPlatformAudienceId === seed.id)
        : undefined;
      const share =
        lookalike && snapshot ? await seedShare(lookalike, snapshot.id) : null;
      const status = seed?.seedMetadata?.status;
      const stage: SeedDeliveryStage =
        share?.status === "shared"
          ? "shared"
          : lookalike
            ? "lookalike"
            : status === "ready"
              ? "uploaded"
              : seed
                ? "uploading"
                : snapshot
                  ? "built"
                  : "not_built";
      return {
        seedListId: list.id,
        seedListName: list.name,
        builtFrom: seedOriginLabel(list.origin),
        wanderData: snapshot ? seedUsesWanderData(snapshot.definition) : null,
        brandId: list.brandId,
        brandName: list.brandName,
        brandSlug: list.brandSlug,
        stage,
        snapshot: snapshot
          ? (({ id, memberCount, diagnostics, createdAt, warning }) => ({
              id,
              memberCount,
              entries: diagnostics.contacts?.identifiable ?? null,
              warning,
              createdAt,
            }))(seedSnapshotSummary(snapshot))
          : null,
        seed: seed
          ? {
              platformAudienceId: seed.id,
              name: seed.name,
              metaAudienceId: seed.externalId,
              status: status ?? null,
              uploaded: seed.seedMetadata?.uploadedCount ?? null,
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
