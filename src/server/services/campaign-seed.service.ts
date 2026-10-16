import { requireMetaAudienceAccount } from "./audience-account";
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  audienceTable,
  adAccountTable,
  brandTable,
  channelTable,
  emailAudienceTable,
  platformAudienceTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import {
  createZernioAdAudience,
  addUsersToZernioAdAudience,
  deleteZernioAdAudience,
  type ZernioAudienceUser,
} from "@/server/clients/zernio.client";
import { listAdsWriteDestinations } from "./ads-write.service";
import {
  linkPlatformAudience,
  requireOwnedCampaign,
} from "./ads-draft.service";
import { normalizeSeedUsers } from "./persona-audience.service";
import {
  compileEmailAudience,
  getEmailAudienceSnapshot,
  readEmailAudienceBatch,
  saveEmailAudience,
} from "./email-audience.service";

type Actor = { organizationId: string; userId: string };
async function scope(audienceId: string, actor: Actor) {
  const audience = await db.query.audienceTable.findFirst({
    where: eq(audienceTable.id, audienceId),
  });
  if (!audience) throw new Error("Campaign audience not found");
  const { brand } = await requireOwnedCampaign(
    audience.campaignId,
    actor.organizationId,
  );
  if (!brand.slug) throw new Error("This brand has no slug");
  return { audience, brand: { ...brand, slug: brand.slug } };
}
export async function prepareCampaignSeed(
  input: { audienceId: string },
  actor: Actor,
) {
  const { brand } = await scope(input.audienceId, actor);
  const fullBrand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brand.id),
    columns: { wanderOsWebsiteId: true },
  });
  if (!fullBrand?.wanderOsWebsiteId)
    throw new Error("Connect a WanderOS website to use past bookers");
  const warehouseActor = {
    organizationId: actor.organizationId,
    userId: actor.userId,
  };
  const saved = await saveEmailAudience(
    {
      brandId: brand.id,
      name: `${brand.name} · past bookers seed`,
      definition: {
        source: "wanderos",
        listId: null,
        guestKinds: ["bookers"],
        clickedWithinDays: null,
        consentConfirmed: false,
        sampleSize: null,
      },
    },
    warehouseActor,
  );
  const snapshot = await compileEmailAudience(
    { audienceId: saved.id },
    warehouseActor,
  );
  return { snapshotId: snapshot.id };
}
export async function campaignSeedSnapshot(
  input: { audienceId: string; snapshotId: string },
  actor: Actor,
) {
  const { brand } = await scope(input.audienceId, actor);
  const snapshot = await getEmailAudienceSnapshot(
    { snapshotId: input.snapshotId },
    actor,
  );
  const source = await db.query.emailAudienceTable.findFirst({
    where: eq(emailAudienceTable.id, snapshot.audienceId),
  });
  if (
    source?.brandId !== brand.id ||
    snapshot.definition.source !== "wanderos" ||
    snapshot.definition.guestKinds.length !== 1 ||
    snapshot.definition.guestKinds[0] !== "bookers"
  )
    throw new Error("Select a past-bookers snapshot for this brand");
  return {
    snapshotId: snapshot.id,
    status: snapshot.status,
    count: snapshot.recipientCount,
    expiresAt: snapshot.expiresAt,
  };
}
async function destination(brand: { id: string; slug: string }, actor: Actor) {
  const channel = await db.query.channelTable.findFirst({
    where: and(
      eq(channelTable.brandId, brand.id),
      eq(channelTable.platform, "meta_ads"),
      isNull(channelTable.deletedAt),
    ),
  });
  const listed = await listAdsWriteDestinations({
    organizationId: actor.organizationId,
    brandSlug: brand.slug,
    platform: "meta",
  });
  const target = listed.destinations[0];
  if (!channel || !target)
    throw new Error(
      "Connect an allowlisted Meta ad account for this brand first",
    );
  const allowed = await db.query.adAccountTable.findMany({
    where: and(
      eq(adAccountTable.brandId, brand.id),
      eq(adAccountTable.platform, "facebook"),
      eq(adAccountTable.isAllowed, true),
    ),
    columns: { id: true, externalId: true },
  });
  const account = allowed.find(
    (a) =>
      a.externalId.replace(/^act_/, "") ===
      target.adAccountId.replace(/^act_/, ""),
  );
  if (!account) throw new Error("This ad account is no longer allowlisted");
  return { channel, target, account };
}
/** Recipients are transient. No action receipts, logging, CSV blobs or recipient tables. */
export async function uploadCampaignSeed(
  input: {
    audienceId: string;
    name?: string;
    source: "csv" | "bigquery";
    users?: ZernioAudienceUser[];
    snapshotId?: string;
    permissionConfirmed: boolean;
  },
  actor: Actor,
) {
  if (!input.permissionConfirmed)
    throw new Error(
      "Confirm permission to use these customers for Meta audience matching",
    );
  const { audience, brand } = await scope(input.audienceId, actor);
  const {
    channel,
    target,
    account: destinationAccount,
  } = await destination(brand, actor);
  const users =
    input.source === "csv" ? normalizeSeedUsers(input.users ?? []) : [];
  let count = users.length;
  if (input.source === "bigquery") {
    if (!input.snapshotId)
      throw new Error("Prepare and review a warehouse snapshot first");
    const snapshot = await campaignSeedSnapshot(
      { audienceId: audience.id, snapshotId: input.snapshotId },
      actor,
    );
    if (
      snapshot.status !== "ready" ||
      Date.parse(snapshot.expiresAt) <= Date.now()
    )
      throw new Error("Prepare a fresh, ready snapshot first");
    count = snapshot.count ?? 0;
  }
  if (!count || count > 50000)
    throw new Error("Seed lists must contain between 1 and 50,000 people");
  const id = createId("paud");
  const name = input.name?.trim() || `${brand.name} · ${audience.name} · seed`;
  let providerId: string | null = null;
  let inserted = false;
  const metadata = {
    source: input.source,
    count,
    ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
  };
  try {
    const created = await createZernioAdAudience({
      accountId: target.connectionAccountId,
      adAccountId: target.adAccountId,
      name,
      type: "customer_list",
    });
    providerId = created.audience?.id ?? null;
    if (!providerId || !created.audience?.platformAudienceId)
      throw new Error("Audience creation did not return an ID");
    await db.insert(platformAudienceTable).values({
      id,
      brandId: brand.id,
      channelId: channel.id,
      adAccountId: destinationAccount.id,
      name,
      type: "custom",
      source: "customer_list",
      externalId: created.audience.platformAudienceId,
      definition: { ...created.audience, adAccountId: target.adAccountId },
      seedMetadata: { ...metadata, status: "uploading" },
    });
    inserted = true;
    if (input.source === "csv") {
      for (let offset = 0; offset < users.length; offset += 10000)
        await uploadSeedBatch(providerId, users.slice(offset, offset + 10000));
    } else {
      let pageToken: string | undefined;
      do {
        const page = await readEmailAudienceBatch(
          { snapshotId: input.snapshotId!, pageSize: 10000, pageToken },
          actor,
        );
        if (page.recipients.length)
          await uploadSeedBatch(
            providerId,
            page.recipients.map((r) => ({ email: r.email })),
          );
        pageToken = page.nextPageToken ?? undefined;
      } while (pageToken);
    }
    await db
      .update(platformAudienceTable)
      .set({ seedMetadata: { ...metadata, status: "ready" } })
      .where(eq(platformAudienceTable.id, id));
    await linkPlatformAudience({
      organizationId: actor.organizationId,
      audienceId: audience.id,
      platformAudienceId: id,
    });
  } catch {
    let cleanupFailed = false;
    if (providerId) {
      try {
        await deleteZernioAdAudience(providerId);
      } catch {
        cleanupFailed = true;
      }
    }
    if (inserted) {
      if (cleanupFailed)
        await db
          .update(platformAudienceTable)
          .set({
            seedMetadata: {
              ...metadata,
              status: "failed",
              cleanupFailed: true,
            },
          })
          .where(eq(platformAudienceTable.id, id));
      else
        await db
          .delete(platformAudienceTable)
          .where(eq(platformAudienceTable.id, id));
    }
    throw new Error(
      cleanupFailed
        ? `Upload failed and cleanup failed. The leftover audience “${name}” must be removed in Meta before retrying.`
        : providerId
          ? "Upload failed. The newly created audience was removed; retry the complete upload."
          : "Audience creation failed before a provider ID was returned. Check Meta for a leftover audience before retrying.",
    );
  }
  return { platformAudienceId: id, count };
}
export async function buildCampaignLookalike(
  input: {
    audienceId: string;
    seedPlatformAudienceId: string;
    country: string;
    approved: boolean;
  },
  actor: Actor,
) {
  if (!input.approved) throw new Error("Approve creation on Meta first");
  const { audience, brand } = await scope(input.audienceId, actor);
  const seed = await db.query.platformAudienceTable.findFirst({
    where: eq(platformAudienceTable.id, input.seedPlatformAudienceId),
    with: { channel: true },
  });
  if (
    !seed ||
    seed.brandId !== brand.id ||
    seed.channel.platform !== "meta_ads" ||
    seed.source !== "customer_list" ||
    !seed.externalId ||
    (seed.seedMetadata && seed.seedMetadata.status !== "ready")
  )
    throw new Error(
      "Choose a ready Meta customer list belonging to this brand",
    );
  const {
    channel,
    target,
    account: destinationAccount,
  } = await destination(brand, actor);
  const account = await requireMetaAudienceAccount(seed);
  if (account.id !== destinationAccount.id)
    throw new Error("This seed belongs to a different Meta ad account");
  const name = `${brand.name} · ${audience.name} · 1% ${input.country} lookalike`;
  let providerId: string | null = null;
  let localId: string | null = null;
  try {
    const created = await createZernioAdAudience({
      accountId: target.connectionAccountId,
      adAccountId: target.adAccountId,
      name,
      type: "lookalike",
      sourceAudienceId: seed.externalId,
      country: input.country,
      ratio: 0.01,
    });
    providerId = created.audience?.id ?? null;
    if (!providerId || !created.audience?.platformAudienceId)
      throw new Error("No provider audience returned");
    localId = createId("paud");
    await db.insert(platformAudienceTable).values({
      id: localId,
      brandId: brand.id,
      channelId: channel.id,
      adAccountId: destinationAccount.id,
      name,
      type: "lookalike",
      source: "lookalike_seed",
      sourceId: seed.externalId,
      parentPlatformAudienceId: seed.id,
      externalId: created.audience.platformAudienceId,
      definition: { ...created.audience, adAccountId: target.adAccountId },
    });
    await linkPlatformAudience({
      organizationId: actor.organizationId,
      audienceId: audience.id,
      platformAudienceId: localId,
    });
    return { platformAudienceId: localId };
  } catch {
    if (providerId) {
      try {
        await deleteZernioAdAudience(providerId);
        if (localId)
          await db
            .delete(platformAudienceTable)
            .where(eq(platformAudienceTable.id, localId));
      } catch {
        if (localId)
          await db
            .update(platformAudienceTable)
            .set({
              seedMetadata: {
                source: seed.seedMetadata?.source ?? "csv",
                count: seed.seedMetadata?.count ?? 0,
                status: "failed",
                cleanupFailed: true,
              },
            })
            .where(eq(platformAudienceTable.id, localId));
        throw new Error(
          `Lookalike creation failed and cleanup failed. Remove “${name}” in Meta before retrying.`,
        );
      }
    }
    throw new Error(
      providerId
        ? "Lookalike creation failed. The new audience was removed; retry the complete operation."
        : "Lookalike creation failed before a provider ID was returned. Check Meta for a leftover audience before retrying.",
    );
  }
}

async function uploadSeedBatch(
  providerId: string,
  users: ZernioAudienceUser[],
) {
  const result = await addUsersToZernioAdAudience(providerId, users);
  if (typeof result.numInvalid === "number" && result.numInvalid > 0)
    throw new Error("Meta rejected customer identifiers");
}
