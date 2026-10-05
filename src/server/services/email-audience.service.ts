import type { JobMetadata, TableMetadata } from "@google-cloud/bigquery";
import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandTable,
  emailAudienceTable,
  emailAudienceSnapshotTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { getBigQueryClient } from "@/server/clients/bigquery.client";
import {
  assertEmailAudienceSource,
  emailAudienceBlockers,
  emailAudienceDefinitionSchema,
  type EmailAudienceDefinition,
  type EmailAudienceRecipient,
} from "@/lib/email-audience";
import { buildEmailAudienceQuery } from "./email-audience-query";

const PROJECT = "wander-9fc9c";
const DATASET = "growth_email_audiences";
const LOCATION = "us-central1";
const MAXIMUM_BYTES = "100000000000";
type Actor = { organizationId: string; userId: string };

async function requireBrand(brandId: string, actor: Actor) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, actor.organizationId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new Error("Brand not found in this workspace.");
  return brand;
}
async function requireAudience(id: string, actor: Actor) {
  const audience = await db.query.emailAudienceTable.findFirst({
    where: eq(emailAudienceTable.id, id),
  });
  if (!audience) throw new Error("Email audience not found.");
  const brand = await requireBrand(audience.brandId, actor);
  return { audience, brand };
}
const snapshotSummary = (
  snapshot: typeof emailAudienceSnapshotTable.$inferSelect,
) => ({
  ...snapshot,
  expiresAt: snapshot.expiresAt.toISOString(),
  createdAt: snapshot.createdAt.toISOString(),
  blockers: emailAudienceBlockers(snapshot.definition),
});

export async function listEmailAudiences(
  input: { brandId: string },
  actor: Actor,
) {
  await requireBrand(input.brandId, actor);
  const audiences = await db.query.emailAudienceTable.findMany({
    where: eq(emailAudienceTable.brandId, input.brandId),
    orderBy: desc(emailAudienceTable.updatedAt),
  });
  const latest = audiences.length
    ? await db
        .selectDistinctOn([emailAudienceSnapshotTable.audienceId], {
          audienceId: emailAudienceSnapshotTable.audienceId,
          id: emailAudienceSnapshotTable.id,
          status: emailAudienceSnapshotTable.status,
          recipientCount: emailAudienceSnapshotTable.recipientCount,
          expiresAt: emailAudienceSnapshotTable.expiresAt,
          revision: emailAudienceSnapshotTable.revision,
        })
        .from(emailAudienceSnapshotTable)
        .where(
          inArray(
            emailAudienceSnapshotTable.audienceId,
            audiences.map((a) => a.id),
          ),
        )
        .orderBy(
          emailAudienceSnapshotTable.audienceId,
          desc(emailAudienceSnapshotTable.createdAt),
        )
    : [];
  const snapshots = new Map(latest.map((s) => [s.audienceId, s]));
  return audiences.map((audience) => ({
    ...audience,
    latestSnapshotId: snapshots.get(audience.id)?.id ?? null,
    latestSnapshot: snapshots.has(audience.id)
      ? {
          status: snapshots.get(audience.id)!.status,
          recipientCount: snapshots.get(audience.id)!.recipientCount,
          expiresAt: snapshots.get(audience.id)!.expiresAt.toISOString(),
          revision: snapshots.get(audience.id)!.revision,
        }
      : null,
    createdAt: audience.createdAt.toISOString(),
    updatedAt: audience.updatedAt.toISOString(),
  }));
}
export async function saveEmailAudience(
  input: {
    brandId: string;
    id?: string;
    expectedRevision?: number;
    name: string;
    definition: EmailAudienceDefinition;
  },
  actor: Actor,
) {
  const brand = await requireBrand(input.brandId, actor);
  const definition = emailAudienceDefinitionSchema.parse(input.definition);
  assertEmailAudienceSource(definition, {
    slug: brand.slug,
    websiteId: brand.wanderOsWebsiteId,
  });
  let id: string;
  if (input.id) {
    const { audience } = await requireAudience(input.id, actor);
    if (audience.brandId !== input.brandId)
      throw new Error("Audience belongs to another brand.");
    if (input.expectedRevision === undefined)
      throw new Error("Pass the audience revision before editing.");
    const changed = await db
      .update(emailAudienceTable)
      .set({
        name: input.name,
        definition,
        revision: sql`${emailAudienceTable.revision}+1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailAudienceTable.id, input.id),
          eq(emailAudienceTable.revision, input.expectedRevision),
        ),
      )
      .returning({ id: emailAudienceTable.id });
    if (!changed.length)
      throw new Error("This audience changed. Reload before saving.");
    id = input.id;
  } else {
    const [created] = await db
      .insert(emailAudienceTable)
      .values({ brandId: input.brandId, name: input.name, definition })
      .returning({ id: emailAudienceTable.id });
    id = created!.id;
  }
  return (await listEmailAudiences({ brandId: input.brandId }, actor)).find(
    (a) => a.id === id,
  )!;
}

export async function previewEmailAudience(
  input: { brandId: string; definition: EmailAudienceDefinition },
  actor: Actor,
) {
  const brand = await requireBrand(input.brandId, actor);
  const definition = emailAudienceDefinitionSchema.parse(input.definition);
  assertEmailAudienceSource(definition, {
    slug: brand.slug,
    websiteId: brand.wanderOsWebsiteId,
  });
  const query = buildEmailAudienceQuery(definition, brand.wanderOsWebsiteId);
  const client = await getBigQueryClient();
  const [estimate] = await client.createQueryJob({
    query: query.sql,
    params: query.params,
    location: LOCATION,
    dryRun: true,
    maximumBytesBilled: MAXIMUM_BYTES,
  });
  const statistics = (estimate.metadata as JobMetadata).statistics;
  // External tables can report a zero LOWER_BOUND, which is not a cost estimate.
  const bytes =
    statistics?.query?.totalBytesProcessedAccuracy === "PRECISE"
      ? String(statistics.totalBytesProcessed ?? "0")
      : null;
  const [rows] = await client.query({
    query: `WITH candidates AS (${query.sql}) SELECT COUNT(*) AS candidateCount, ARRAY_AGG(STRUCT(email, first_name, source_id, reason) ORDER BY email LIMIT 10) AS sample FROM candidates`,
    params: query.params,
    location: LOCATION,
    maximumBytesBilled: MAXIMUM_BYTES,
  });
  let sourceLoadedThrough: string | null = null;
  if (definition.source === "wander_cio") {
    const sourceTables = [
      "people",
      "attributes",
      ...(definition.clickedWithinDays ? ["metrics", "deliveries"] : []),
    ];
    const [freshnessRows] = await client.query({
      query: `SELECT CAST(MIN(loaded) AS STRING) AS loaded FROM (${sourceTables.map((table) => `SELECT MAX(_load_date) loaded FROM \`wander-9fc9c.customer_io.${table}\``).join(" UNION ALL ")})`,
      location: LOCATION,
      maximumBytesBilled: MAXIMUM_BYTES,
    });
    sourceLoadedThrough =
      (freshnessRows as Array<{ loaded: string | null }>)[0]?.loaded ?? null;
  }
  return {
    sourceLoadedThrough,
    candidateCount: Number(
      (
        rows as Array<{
          candidateCount: number;
          sample: EmailAudienceRecipient[];
        }>
      )[0]?.candidateCount ?? 0,
    ),
    sample:
      (rows as Array<{ sample: EmailAudienceRecipient[] }>)[0]?.sample ?? [],
    querySql: query.sql,
    estimatedBytes: bytes,
    blockers: emailAudienceBlockers(definition),
    source: definition.source,
    checkedAt: new Date().toISOString(),
  };
}

export async function compileEmailAudience(
  input: { audienceId: string; expectedRevision: number },
  actor: Actor,
) {
  const { audience, brand } = await requireAudience(input.audienceId, actor);
  if (audience.revision !== input.expectedRevision)
    throw new Error(
      "Audience changed. Preview and compile the current revision.",
    );
  assertEmailAudienceSource(audience.definition, {
    slug: brand.slug,
    websiteId: brand.wanderOsWebsiteId,
  });
  const query = buildEmailAudienceQuery(
    audience.definition,
    brand.wanderOsWebsiteId,
  );
  const client = await getBigQueryClient();
  await client.createQueryJob({
    query: query.sql,
    params: query.params,
    location: LOCATION,
    dryRun: true,
    maximumBytesBilled: MAXIMUM_BYTES,
  });
  const dataset = client.dataset(DATASET, { projectId: PROJECT });
  const [exists] = await dataset.exists();
  if (!exists) {
    try {
      await dataset.create({
        location: LOCATION,
        defaultTableExpirationMs: String(30 * 86400000),
      });
    } catch (error) {
      const [nowExists] = await dataset.exists();
      if (!nowExists) throw error;
    }
  }
  const id = createId("easnap");
  const tableId = `snapshot_${id}`;
  const jobId = `compile_${id}`;
  const expiresAt = new Date(Date.now() + 30 * 86400000);
  const [snapshot] = await db
    .insert(emailAudienceSnapshotTable)
    .values({
      id,
      audienceId: audience.id,
      revision: audience.revision,
      definition: audience.definition,
      querySql: query.sql,
      queryHash: createHash("sha256")
        .update(JSON.stringify(query))
        .digest("hex"),
      jobId,
      tableId,
      expiresAt,
    })
    .returning();
  try {
    await dataset.createTable(tableId, {
      schema: "email:STRING,first_name:STRING,source_id:STRING,reason:STRING",
      expirationTime: String(expiresAt.getTime()),
    });
    await client.createQueryJob({
      query: query.sql,
      params: query.params,
      location: LOCATION,
      jobId,
      destination: dataset.table(tableId),
      writeDisposition: "WRITE_EMPTY",
      maximumBytesBilled: MAXIMUM_BYTES,
    });
  } catch (error) {
    await db
      .update(emailAudienceSnapshotTable)
      .set({
        status: "failed",
        error: "Warehouse compilation failed. Inspect the job before retrying.",
      })
      .where(eq(emailAudienceSnapshotTable.id, id));
    throw error;
  }
  return snapshotSummary(snapshot!);
}

export async function getEmailAudienceSnapshot(
  input: { snapshotId: string },
  actor: Actor,
) {
  const snapshot = await db.query.emailAudienceSnapshotTable.findFirst({
    where: eq(emailAudienceSnapshotTable.id, input.snapshotId),
  });
  if (!snapshot) throw new Error("Snapshot not found.");
  await requireAudience(snapshot.audienceId, actor);
  if (snapshot.status !== "compiling") return snapshotSummary(snapshot);
  const client = await getBigQueryClient();
  const [metadata] = (await client
    .job(snapshot.jobId, { location: LOCATION, projectId: PROJECT })
    .getMetadata()) as [JobMetadata, ...unknown[]];
  if (metadata.status?.state !== "DONE") return snapshotSummary(snapshot);
  const failed = Boolean(metadata.status?.errorResult);
  let count: number | null = null;
  if (!failed) {
    const [tableMetadata] = (await client
      .dataset(DATASET, { projectId: PROJECT })
      .table(snapshot.tableId)
      .getMetadata()) as [TableMetadata, ...unknown[]];
    count = Number(tableMetadata.numRows ?? 0);
  }
  const [updated] = await db
    .update(emailAudienceSnapshotTable)
    .set({
      status: failed ? "failed" : "ready",
      recipientCount: count,
      error: failed
        ? "Warehouse query failed. Inspect the job for details."
        : null,
    })
    .where(eq(emailAudienceSnapshotTable.id, snapshot.id))
    .returning();
  return snapshotSummary(updated!);
}

export async function readEmailAudienceBatch(
  input: { snapshotId: string; pageToken?: string; pageSize?: number },
  actor: Actor,
) {
  const snapshot = await getEmailAudienceSnapshot(input, actor);
  if (snapshot.status !== "ready") throw new Error("Snapshot is not ready.");
  if (Date.parse(snapshot.expiresAt) <= Date.now())
    throw new Error("Snapshot expired. Compile a new audience.");
  const client = await getBigQueryClient();
  const [rows, next] = await client
    .dataset(DATASET, { projectId: PROJECT })
    .table(snapshot.tableId)
    .getRows({
      autoPaginate: false,
      maxResults: Math.min(10000, Math.max(1, input.pageSize ?? 500)),
      pageToken: input.pageToken,
    });
  return {
    recipients: rows as EmailAudienceRecipient[],
    nextPageToken: next?.pageToken ?? null,
    snapshotId: snapshot.id,
    requiresLiveEligibilityCheck: true as const,
  };
}
