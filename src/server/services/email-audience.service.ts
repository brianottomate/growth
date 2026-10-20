import type { JobMetadata } from "@google-cloud/bigquery";
import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, emailAudienceTable } from "@/server/db/schema";
import { getBigQueryClient } from "@/server/clients/bigquery.client";
import {
  assertEmailAudienceSource,
  emailAudienceBlockers,
  emailAudienceDefinitionSchema,
  type EmailAudienceDefinition,
  type EmailAudienceRecipient,
} from "@/lib/email-audience";
import { buildEmailAudienceQuery } from "./email-audience-query";
import {
  createEmailList,
  appendEmailListMembers,
  emailListCounts,
  type EmailListUploadRow,
  previewEmailListMembers,
  readEmailListPage,
  requireBrandEmailList,
} from "./email-list.service";

const LOCATION = "us-central1";
const MAXIMUM_BYTES = "100000000000";
type Actor = { organizationId: string; userId: string };

async function requireBrand(
  brandId: string,
  actor: Pick<Actor, "organizationId">,
) {
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
/** Source rules, plus: an uploaded list must be this brand's own. */
async function assertAudienceSource(
  definition: EmailAudienceDefinition,
  brand: { id: string; slug: string | null; wanderOsWebsiteId: string | null },
) {
  assertEmailAudienceSource(definition, {
    slug: brand.slug,
    websiteId: brand.wanderOsWebsiteId,
  });
  return definition.listId
    ? requireBrandEmailList(definition.listId, brand.id)
    : null;
}

export async function listEmailAudiences(
  input: { brandId: string },
  actor: Pick<Actor, "organizationId">,
) {
  await requireBrand(input.brandId, actor);
  const audiences = await db.query.emailAudienceTable.findMany({
    where: eq(emailAudienceTable.brandId, input.brandId),
    orderBy: desc(emailAudienceTable.updatedAt),
  });
  const counts = await emailListCounts(
    audiences.flatMap((a) =>
      a.definition.listId ? [a.definition.listId] : [],
    ),
  );
  return audiences.map((audience) => ({
    ...audience,
    recipientCount: audience.definition.listId
      ? Math.min(
          audience.definition.sampleSize ?? Number.MAX_SAFE_INTEGER,
          counts.get(audience.definition.listId) ?? 0,
        )
      : null,
    createdAt: audience.createdAt.toISOString(),
    updatedAt: audience.updatedAt.toISOString(),
  }));
}
export async function saveEmailAudience(
  input: {
    brandId: string;
    id?: string;
    name: string;
    definition: EmailAudienceDefinition;
  },
  actor: Actor,
) {
  const brand = await requireBrand(input.brandId, actor);
  const definition = emailAudienceDefinitionSchema.parse(input.definition);
  await assertAudienceSource(definition, brand);
  let id: string;
  if (input.id) {
    const { audience } = await requireAudience(input.id, actor);
    if (audience.brandId !== input.brandId)
      throw new Error("Audience belongs to another brand.");
    const changed = await db
      .update(emailAudienceTable)
      .set({
        name: input.name,
        definition,
        updatedAt: new Date(),
      })
      .where(eq(emailAudienceTable.id, input.id))
      .returning({ id: emailAudienceTable.id });
    if (!changed.length) throw new Error("Audience not found");
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
  const list = await assertAudienceSource(definition, brand);
  if (list) {
    const memberCount = (await emailListCounts([list.id])).get(list.id) ?? 0;
    return {
      sourceLoadedThrough: null,
      candidateCount: Math.min(
        definition.sampleSize ?? memberCount,
        memberCount,
      ),
      sample: await previewEmailListMembers(list),
      querySql: `Uploaded list ${list.id} (${memberCount} members)`,
      estimatedBytes: null,
      blockers: emailAudienceBlockers(definition),
      source: definition.source,
      checkedAt: new Date().toISOString(),
    };
  }
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

/** Upload an operator's list and save it as the brand's audience. */
export async function importEmailList(
  input: {
    brandId: string;
    name: string;
    fileName: string | null;
    consentConfirmed: boolean;
    rows: EmailListUploadRow[];
  },
  actor: Actor,
) {
  const brand = await requireBrand(input.brandId, actor);
  const list = await createEmailList({
    brandId: brand.id,
    name: input.name,
    fileName: input.fileName,
    createdBy: actor.userId,
    rows: input.rows,
  });
  const audience = await saveEmailAudience(
    {
      brandId: brand.id,
      name: input.name,
      definition: emailAudienceDefinitionSchema.parse({
        source: "list",
        listId: list.id,
        clickedWithinDays: null,
        consentConfirmed: input.consentConfirmed,
      }),
    },
    actor,
  );
  return {
    audience,
    imported: list.imported,
    invalid: list.invalidCount,
    duplicates: list.duplicateCount,
    namesCleared: list.namesCleared,
  };
}

/** A send references the audience itself; membership is resolved when read. */
export async function getEmailAudience(
  input: { audienceId: string },
  actor: Actor,
) {
  const { audience, brand } = await requireAudience(input.audienceId, actor);
  const list = await assertAudienceSource(audience.definition, brand);
  const counts = list ? await emailListCounts([list.id]) : null;
  return {
    ...audience,
    recipientCount: list
      ? Math.min(
          audience.definition.sampleSize ?? Number.MAX_SAFE_INTEGER,
          counts?.get(list.id) ?? 0,
        )
      : null,
  };
}

export async function readEmailAudienceRecipients(
  input: { audienceId: string },
  actor: Actor,
) {
  const { audience, brand } = await requireAudience(input.audienceId, actor);
  const list = await assertAudienceSource(audience.definition, brand);
  if (list) {
    const recipients: EmailAudienceRecipient[] = [];
    let pageToken: string | null = null;
    do {
      const page = await readEmailListPage({
        list,
        sampleSize: audience.definition.sampleSize,
        pageSize: 10000,
        pageToken: pageToken ?? undefined,
      });
      recipients.push(...page.recipients);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return recipients;
  }
  const query = buildEmailAudienceQuery(
    audience.definition,
    brand.wanderOsWebsiteId,
  );
  const client = await getBigQueryClient();
  const [rows] = await client.query({
    query: query.sql,
    params: query.params,
    location: LOCATION,
    maximumBytesBilled: MAXIMUM_BYTES,
  });
  return rows as EmailAudienceRecipient[];
}

/** Extend an existing database audience without replacing its list or scheduled deliveries. */
export async function addEmailAudienceMembers(
  input: {
    audienceId: string;
    consentConfirmed: true;
    rows: EmailListUploadRow[];
  },
  actor: Actor,
) {
  const { audience, brand } = await requireAudience(input.audienceId, actor);
  const list = await assertAudienceSource(audience.definition, brand);
  if (!list)
    throw new Error("Only database-list audiences accept new members.");
  if (!audience.definition.consentConfirmed)
    throw new Error("Confirm the audience's marketing permission first.");
  const result = await appendEmailListMembers({
    listId: list.id,
    brandId: brand.id,
    rows: input.rows,
  });
  return result;
}
