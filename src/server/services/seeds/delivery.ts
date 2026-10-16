import { requireMetaAudienceAccount } from "../audience-account";
import { uploadSeedBatches, SeedAcknowledgmentError } from "./upload-batches";
import { z } from "zod";
import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  emailListMemberTable,
  channelTable,
  adAccountTable,
  platformAudienceTable,
} from "@/server/db/schema";
import { getBigQueryClient } from "@/server/clients/bigquery.client";
import {
  addUsersToZernioAdAudience,
  getZernioAdAudience,
} from "@/server/clients/zernio.client";
import {
  createAdAudience,
  listAdsWriteDestinations,
} from "../ads-write.service";
import { linkPlatformAudience } from "../ads-draft.service";
import { assignPersonaAudience } from "../persona-audience.service";
import {
  requireSeedSnapshot,
  seedEmailHash,
  seedMembers,
  requireWanderSeedSource,
  type SeedActor,
} from "./service";
import { buildClientSeedQuery, seedEligibleProfilesSql } from "./query";
import type { SeedDefinition } from "@/lib/seed-definition";

class SeedSourceChangedError extends Error {}

type DeliveryActor = SeedActor & { runId: string };
async function destination(
  brand: { id: string; slug: string | null },
  actor: SeedActor,
  adAccountId?: string,
) {
  if (!brand.slug) throw new Error("Brand has no slug");
  const channel = await db.query.channelTable.findFirst({
    where: and(
      eq(channelTable.brandId, brand.id),
      eq(channelTable.platform, "meta_ads"),
      isNull(channelTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!channel)
    throw new Error("Connect a Meta Ads channel before creating an audience");
  const listed = await listAdsWriteDestinations({
    organizationId: actor.organizationId,
    brandSlug: brand.slug,
    platform: "meta",
  });
  const options = adAccountId
    ? listed.destinations.filter((d) => d.adAccountId === adAccountId)
    : listed.destinations;
  if (options.length !== 1)
    throw new Error(
      "Choose exactly one allowlisted Meta destination; no account will be guessed",
    );
  const target = options[0]!;
  const allowed = await db.query.adAccountTable.findMany({
    where: and(
      eq(adAccountTable.brandId, brand.id),
      eq(adAccountTable.platform, "facebook"),
      eq(adAccountTable.isAllowed, true),
    ),
    columns: { id: true, externalId: true },
  });
  const local = allowed.find(
    (a) =>
      a.externalId.replace(/^act_/, "") ===
      target.adAccountId.replace(/^act_/, ""),
  );
  if (!local) throw new Error("The destination is no longer allowlisted");
  return { ...target, localAdAccountId: local.id };
}
async function resolveEmails(
  hashes: string[],
  d: SeedDefinition,
  websiteId: string | null,
  asOf: string,
) {
  const wanted = new Set(hashes),
    emails = new Map<string, string>();
  if (d.uploadedListIds.length) {
    const rows = await db.query.emailListMemberTable.findMany({
      where: inArray(emailListMemberTable.listId, d.uploadedListIds),
      columns: { email: true },
    });
    for (const row of rows) {
      const hash = seedEmailHash(row.email);
      if (wanted.has(hash)) emails.set(hash, row.email.trim().toLowerCase());
    }
  }
  const queries = [];
  if (d.wander)
    queries.push({
      sql: `WITH ${seedEligibleProfilesSql} SELECT DISTINCT email FROM eligible WHERE email_hash IN UNNEST(@hashes)`,
      params: { hashes },
    });
  if (d.clientBookers) {
    const q = buildClientSeedQuery(websiteId!, asOf);
    const plaintext = q.sql.replace(
      "LOWER(TO_HEX(SHA256(u.email))) email_hash",
      "u.email email",
    );
    queries.push({
      sql: `SELECT email FROM (${plaintext}) WHERE LOWER(TO_HEX(SHA256(email))) IN UNNEST(@hashes)`,
      params: { ...q.params, hashes },
    });
  }
  if (queries.length) {
    const bq = await getBigQueryClient();
    for (const q of queries) {
      const [job] = await bq.createQueryJob({
        query: q.sql,
        params: q.params,
        location: "us-central1",
        maximumBytesBilled: "20000000000",
      });
      const [raw] = (await job.getQueryResults()) as [unknown[]];
      const rows = z.array(z.object({ email: z.email() })).parse(raw);
      for (const row of rows) {
        if (typeof row.email !== "string")
          throw new Error("Source returned an invalid email identity");
        const hash = seedEmailHash(row.email);
        if (wanted.has(hash)) emails.set(hash, row.email.trim().toLowerCase());
      }
    }
  }
  if (emails.size !== wanted.size)
    throw new SeedSourceChangedError(
      `Resolved ${emails.size}/${wanted.size} snapshot contacts. Refresh the seed before uploading; source contacts changed.`,
    );
  return hashes.map((h) => ({ email: emails.get(h)! }));
}

/** Never auto-retry creation. Resume a known local asset instead; uploads are additive. */
export async function uploadSeed(
  input: {
    snapshotId: string;
    adAccountId?: string;
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
  if (snapshot.definition.wander) await requireWanderSeedSource(actor);
  if (!snapshot.memberCount)
    throw new Error("This snapshot has no matching contacts");
  const target = await destination(brand, actor, input.adAccountId);
  let asset = input.platformAudienceId
    ? await db.query.platformAudienceTable.findFirst({
        where: and(
          eq(platformAudienceTable.id, input.platformAudienceId),
          eq(platformAudienceTable.brandId, brand.id),
        ),
      })
    : null;
  if (
    input.platformAudienceId &&
    (asset?.seedSnapshotId !== snapshot.id ||
      asset.adAccountId !== target.localAdAccountId ||
      asset.source !== "customer_list")
  )
    throw new Error(
      "Resume an audience created from this snapshot in this exact ad account",
    );
  if (asset?.seedMetadata?.status === "ready")
    return {
      platformAudienceId: asset.id,
      uploaded: asset.seedMetadata.uploadedCount ?? asset.seedMetadata.count,
      total: snapshot.memberCount,
    };
  if (!asset) {
    const created = await createAdAudience(
      {
        brandSlug: brand.slug!,
        connectionAccountId: target.connectionAccountId,
        adAccountId: target.adAccountId,
        type: "customer_list",
        seedSnapshotId: snapshot.id,
        name:
          input.name?.trim() || `${brand.name} · ${list.name} · ${snapshot.id}`,
      },
      actor,
    );
    if (!created.platformAudienceId)
      throw new Error(
        "Provider audience created without a local record. Inspect the provider before retrying.",
      );
    asset =
      (await db.query.platformAudienceTable.findFirst({
        where: eq(platformAudienceTable.id, created.platformAudienceId),
      })) ?? null;
    if (!asset)
      throw new Error(
        `Seed ${created.platformAudienceId} was created; inspect it before retrying`,
      );
  }
  const providerId =
    (asset.definition as { id?: string; _id?: string } | null)?.id ??
    (asset.definition as { _id?: string } | null)?._id;
  if (!providerId)
    throw new Error(
      `Audience ${asset.id} has no provider record ID; inspect before retrying`,
    );
  let uploaded = asset.seedMetadata?.uploadedCount ?? 0;
  try {
    await uploadSeedBatches({
      alreadyUploaded: uploaded,
      page: async (afterHash) => {
        const page = await seedMembers(
          { snapshotId: snapshot.id, afterHash, limit: 10000 },
          actor,
        );
        return {
          hashes: page.members.map((m) => m.emailHash),
          nextAfterHash: page.nextAfterHash,
        };
      },
      resolve: (hashes) =>
        resolveEmails(
          hashes,
          snapshot.definition,
          brand.wanderOsWebsiteId,
          snapshot.asOf.toISOString(),
        ),
      send: (users) => addUsersToZernioAdAudience(providerId, users),
      progress: async (count) => {
        uploaded = count;
        await db
          .update(platformAudienceTable)
          .set({
            seedMetadata: {
              source: "seed",
              count: snapshot.memberCount,
              uploadedCount: uploaded,
              status: "uploading",
            },
          })
          .where(eq(platformAudienceTable.id, asset.id));
      },
    });
    await db
      .update(platformAudienceTable)
      .set({
        seedMetadata: {
          source: "seed",
          count: snapshot.memberCount,
          uploadedCount: uploaded,
          status: "ready",
        },
      })
      .where(eq(platformAudienceTable.id, asset.id));
  } catch (error) {
    await db
      .update(platformAudienceTable)
      .set({
        seedMetadata: {
          source: "seed",
          count: snapshot.memberCount,
          uploadedCount: uploaded,
          status: "failed",
        },
      })
      .where(eq(platformAudienceTable.id, asset.id));
    throw new Error(
      `${error instanceof SeedSourceChangedError || error instanceof SeedAcknowledgmentError ? error.message + " " : ""}Upload stopped after ${uploaded}/${snapshot.memberCount} confirmed contacts. Resume platformAudienceId ${asset.id}; do not create another audience. No lookalike or campaign attachment was made.`,
    );
  }
  return {
    platformAudienceId: asset.id,
    uploaded,
    total: snapshot.memberCount,
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
  const asset = await db.query.platformAudienceTable.findFirst({
    where: and(
      eq(platformAudienceTable.id, input.platformAudienceId),
      eq(platformAudienceTable.brandId, brand.id),
      eq(platformAudienceTable.seedSnapshotId, snapshot.id),
    ),
  });
  if (!asset) throw new Error("Seed asset not found on this snapshot");
  const record = asset.definition as { id?: string; _id?: string } | null;
  const providerId = record?.id ?? record?._id;
  if (!providerId) throw new Error("Audience has no provider ID");
  // Recheck allowlisting even for reads; permission may have changed after upload.
  await destination(
    brand,
    actor,
    (await requireMetaAudienceAccount(asset)).externalId,
  );
  const provider = await getZernioAdAudience(providerId);
  return {
    platformAudienceId: asset.id,
    sourceCount: snapshot.memberCount,
    uploadStatus: asset.seedMetadata?.status ?? null,
    provider: provider.audience
      ? z.record(z.string(), z.json()).parse(provider.audience)
      : null,
  };
}
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
  const seed = await db.query.platformAudienceTable.findFirst({
    where: and(
      eq(platformAudienceTable.id, input.seedPlatformAudienceId),
      eq(platformAudienceTable.brandId, brand.id),
      eq(platformAudienceTable.seedSnapshotId, snapshot.id),
    ),
  });
  if (
    !seed?.externalId ||
    seed.source !== "customer_list" ||
    seed.seedMetadata?.status !== "ready"
  )
    throw new Error(
      "Choose a fully uploaded customer-list asset for this snapshot",
    );
  const target = await destination(
    brand,
    actor,
    (await requireMetaAudienceAccount(seed)).externalId,
  );
  const fresh = await seedAssetStatus(
    { snapshotId: snapshot.id, platformAudienceId: seed.id },
    actor,
  );
  const status = fresh.provider?.status;
  if (status === "pending" || status === "processing")
    throw new Error(
      "Meta is still processing this seed; check status again before creating a lookalike",
    );
  const created = await createAdAudience(
    {
      brandSlug: brand.slug!,
      connectionAccountId: target.connectionAccountId,
      adAccountId: target.adAccountId,
      type: "lookalike",
      name: `${seed.name} · ${Math.round(input.ratio * 100)}% ${input.country}`,
      sourceAudienceId: seed.externalId,
      parentPlatformAudienceId: seed.id,
      country: input.country,
      ratio: input.ratio,
    },
    actor,
  );
  if (!created.platformAudienceId)
    throw new Error(
      "Lookalike created without a local record; inspect before retrying",
    );
  return {
    platformAudienceId: created.platformAudienceId,
    parentPlatformAudienceId: seed.id,
  };
}
export async function attachSeedAsset(
  input: {
    snapshotId: string;
    platformAudienceId: string;
    target: { type: "campaign_audience" | "persona"; id: string };
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
  const parent = asset.parentPlatformAudienceId
    ? await db.query.platformAudienceTable.findFirst({
        where: and(
          eq(platformAudienceTable.id, asset.parentPlatformAudienceId),
          eq(platformAudienceTable.brandId, brand.id),
        ),
      })
    : null;
  const seed =
    asset.seedSnapshotId === snapshot.id
      ? asset
      : parent?.seedSnapshotId === snapshot.id
        ? parent
        : null;
  if (seed?.seedMetadata?.status !== "ready")
    throw new Error(
      "Choose an uploaded seed or its lookalike from this snapshot",
    );
  await destination(
    brand,
    actor,
    (await requireMetaAudienceAccount(seed)).externalId,
  );
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
