import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  emailListTable,
  emailListMemberTable,
  seedListTable,
  seedMemberTable,
  seedSnapshotTable,
  platformAudienceTable,
} from "@/server/db/schema";
import { getBigQueryClient } from "@/server/clients/bigquery.client";
import {
  seedDefinitionSchema,
  seedEvidenceScore,
  seedEvidenceCounts,
  selectSeedCandidates,
  type SeedCandidate,
  type SeedDefinition,
  type SeedEvidence,
  type SeedQueryParams,
} from "@/lib/seed-definition";
import { getWanderMembership } from "@/server/wander-workspace";
import { buildClientSeedQuery, buildWanderSeedQuery } from "./query";

export type SeedActor = { organizationId: string; userId: string };
export const seedEmailHash = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
export async function requireSeedBrand(brandId: string, actor: SeedActor) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, actor.organizationId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new Error("Brand not found in this workspace");
  return brand;
}
export async function requireSeedList(id: string, actor: SeedActor) {
  const list = await db.query.seedListTable.findFirst({
    where: eq(seedListTable.id, id),
  });
  if (!list) throw new Error("Seed list not found");
  const brand = await requireSeedBrand(list.brandId, actor);
  return { list, brand };
}
export async function requireSeedSnapshot(id: string, actor: SeedActor) {
  const snapshot = await db.query.seedSnapshotTable.findFirst({
    where: eq(seedSnapshotTable.id, id),
  });
  if (!snapshot) throw new Error("Seed snapshot not found");
  return { snapshot, ...(await requireSeedList(snapshot.seedListId, actor)) };
}
export async function requireWanderSeedSource(actor: SeedActor) {
  const membership = await getWanderMembership(actor.userId);
  if (membership?.organizationId !== actor.organizationId)
    throw new Error(
      "Wander warehouse audience data is not available in this workspace",
    );
}
const listSummary = (r: typeof seedListTable.$inferSelect) => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
export const seedSnapshotSummary = (
  s: typeof seedSnapshotTable.$inferSelect,
) => ({
  ...s,
  downloadUrl: `/api/seeds/${s.id}`,
  asOf: s.asOf.toISOString(),
  createdAt: s.createdAt.toISOString(),
});
export async function listSeeds(input: { brandId: string }, actor: SeedActor) {
  await requireSeedBrand(input.brandId, actor);
  return (
    await db.query.seedListTable.findMany({
      where: eq(seedListTable.brandId, input.brandId),
      orderBy: desc(seedListTable.updatedAt),
    })
  ).map(listSummary);
}
export async function readSeed(
  input: { seedListId: string },
  actor: SeedActor,
) {
  const { list } = await requireSeedList(input.seedListId, actor);
  const [snapshots, assets] = await Promise.all([
    db.query.seedSnapshotTable.findMany({
      where: eq(seedSnapshotTable.seedListId, list.id),
      orderBy: desc(seedSnapshotTable.createdAt),
      limit: 30,
    }),
    db
      .select({
        id: platformAudienceTable.id,
        name: platformAudienceTable.name,
        adAccountId: platformAudienceTable.adAccountId,
        seedSnapshotId: platformAudienceTable.seedSnapshotId,
        parentPlatformAudienceId:
          platformAudienceTable.parentPlatformAudienceId,
        externalId: platformAudienceTable.externalId,
        seedMetadata: platformAudienceTable.seedMetadata,
      })
      .from(platformAudienceTable)
      .innerJoin(
        seedSnapshotTable,
        eq(seedSnapshotTable.id, platformAudienceTable.seedSnapshotId),
      )
      .where(eq(seedSnapshotTable.seedListId, list.id)),
  ]);
  const lookalikes = assets.length
    ? await db.query.platformAudienceTable.findMany({
        where: and(
          eq(platformAudienceTable.brandId, list.brandId),
          inArray(
            platformAudienceTable.parentPlatformAudienceId,
            assets.map((a) => a.id),
          ),
        ),
        columns: {
          id: true,
          name: true,
          adAccountId: true,
          seedSnapshotId: true,
          parentPlatformAudienceId: true,
          externalId: true,
          seedMetadata: true,
        },
      })
    : [];
  return {
    list: listSummary(list),
    snapshots: snapshots.map(seedSnapshotSummary),
    assets: [...assets, ...lookalikes],
  };
}
async function validateSources(
  d: SeedDefinition,
  brandId: string,
  actor: SeedActor,
) {
  const brand = await requireSeedBrand(brandId, actor);
  if (d.wander) await requireWanderSeedSource(actor);
  if (d.clientBookers && !brand.wanderOsWebsiteId)
    throw new Error("This brand has no WanderOS website");
  if (d.uploadedListIds.length) {
    const lists = await db.query.emailListTable.findMany({
      where: inArray(emailListTable.id, d.uploadedListIds),
      columns: { id: true, brandId: true },
    });
    if (
      lists.length !== new Set(d.uploadedListIds).size ||
      lists.some((l) => l.brandId !== brandId)
    )
      throw new Error("Choose uploaded lists belonging to this brand");
  }
  return brand;
}
export async function saveSeed(
  input: {
    brandId: string;
    id?: string;
    name: string;
    definition: SeedDefinition;
  },
  actor: SeedActor,
) {
  const definition = seedDefinitionSchema.parse(input.definition);
  await validateSources(definition, input.brandId, actor);
  if (input.id) {
    const { list } = await requireSeedList(input.id, actor);
    if (list.brandId !== input.brandId)
      throw new Error("Seed list belongs to a different brand");
    const [r] = await db
      .update(seedListTable)
      .set({ name: input.name, definition, updatedAt: new Date() })
      .where(eq(seedListTable.id, list.id))
      .returning();
    return listSummary(r!);
  }
  const [r] = await db
    .insert(seedListTable)
    .values({ brandId: input.brandId, name: input.name, definition })
    .returning();
  return listSummary(r!);
}
const signal = z.object({
  email_hash: z.string().regex(/^[a-f0-9]{64}$/),
  search: z.string().nullable().optional(),
  ring: z.coerce.number().int().nonnegative().optional(),
  source: z.string().optional(),
  bookings: z.coerce.number().nonnegative(),
  views: z.coerce.number().nonnegative().optional(),
  dates: z.coerce.number().nonnegative().optional(),
  checkouts: z.coerce.number().nonnegative().optional(),
});
export async function collectSeed(
  input: { brandId: string; definition: SeedDefinition; asOf?: string },
  actor: SeedActor,
) {
  const d = seedDefinitionSchema.parse(input.definition);
  const brand = await validateSources(d, input.brandId, actor);
  const asOf = input.asOf ?? new Date().toISOString();
  const candidates: SeedCandidate[] = [];
  const sources: {
    name: string;
    rows: number;
    jobId: string | null;
    bytesProcessed: string | null;
  }[] = [];
  const queries: { sql: string; params: SeedQueryParams }[] = [];
  for (const listId of new Set(d.uploadedListIds)) {
    const rows = await db.query.emailListMemberTable.findMany({
      where: eq(emailListMemberTable.listId, listId),
      columns: { email: true },
    });
    for (const r of rows)
      candidates.push({
        emailHash: seedEmailHash(r.email),
        evidence: [
          {
            source: `uploaded:${listId}`,
            search: null,
            score: 100,
            ring: 0,
            bookings: 0,
            views: 0,
            dates: 0,
            checkouts: 0,
          },
        ],
      });
    sources.push({
      name: `uploaded:${listId}`,
      rows: rows.length,
      jobId: null,
      bytesProcessed: null,
    });
  }
  const requested = [
    ...(d.clientBookers
      ? [
          {
            name: "client_bookers",
            query: buildClientSeedQuery(brand.wanderOsWebsiteId!, asOf),
          },
        ]
      : []),
    ...(d.wander
      ? [{ name: "wander", query: buildWanderSeedQuery(d, asOf) }]
      : []),
  ];
  if (requested.length) {
    const client = await getBigQueryClient();
    for (const { name, query } of requested) {
      queries.push(query);
      const options = {
        query: query.sql,
        params: query.params,
        location: "us-central1",
        maximumBytesBilled: "20000000000",
      };
      await client.createQueryJob({ ...options, dryRun: true });
      const [job] = await client.createQueryJob(options);
      const [rows] = (await job.getQueryResults()) as [unknown[]];
      const metadata = z
        .object({
          statistics: z
            .object({
              query: z
                .object({ totalBytesProcessed: z.string().optional() })
                .optional(),
            })
            .optional(),
        })
        .parse((await job.getMetadata())[0]);
      sources.push({
        name,
        rows: rows.length,
        jobId: job.id ?? null,
        bytesProcessed: metadata.statistics?.query?.totalBytesProcessed ?? null,
      });
      for (const raw of rows) {
        const r = signal.parse(raw);
        const e: SeedEvidence = {
          source: r.source ?? name,
          search: r.search ?? null,
          score: 0,
          ring: r.ring ?? 0,
          bookings: r.bookings,
          views: r.views ?? 0,
          dates: r.dates ?? 0,
          checkouts: r.checkouts ?? 0,
        };
        e.score = seedEvidenceScore(e);
        candidates.push({ emailHash: r.email_hash, evidence: [e] });
      }
    }
  }
  const selected = selectSeedCandidates(candidates, d);
  return { ...selected, asOf, definition: d, sources, queries };
}
export async function previewSeed(
  input: { brandId: string; definition: SeedDefinition },
  actor: SeedActor,
) {
  const { members, ...result } = await collectSeed(input, actor);
  const evidenceCounts = seedEvidenceCounts(members);
  return { ...result, memberCount: members.length, evidenceCounts };
}
export async function compileSeed(
  input: { seedListId: string },
  actor: SeedActor,
) {
  const { list } = await requireSeedList(input.seedListId, actor);
  const result = await collectSeed(
    { brandId: list.brandId, definition: list.definition },
    actor,
  );
  // Membership and its count appear atomically; an interrupted build leaves no partial snapshot.
  const snapshot = await withTransaction(async (tx) => {
    const [saved] = await tx
      .insert(seedSnapshotTable)
      .values({
        seedListId: list.id,
        definition: result.definition,
        asOf: new Date(result.asOf),
        memberCount: result.members.length,
        diagnostics: {
          expansion: result.expansion,
          goalMet: result.goalMet,
          candidateCount: result.candidateCount,
          excludedCount: result.excludedCount,
          sources: result.sources,
          queries: result.queries,
        },
      })
      .returning();
    for (let i = 0; i < result.members.length; i += 1000)
      await tx
        .insert(seedMemberTable)
        .values(
          result.members
            .slice(i, i + 1000)
            .map((m) => ({ ...m, snapshotId: saved!.id })),
        );
    return saved!;
  });
  return seedSnapshotSummary(snapshot);
}
export async function seedMembers(
  input: { snapshotId: string; afterHash?: string; limit?: number },
  actor: SeedActor,
) {
  const { snapshot } = await requireSeedSnapshot(input.snapshotId, actor);
  const rows = await db.query.seedMemberTable.findMany({
    where: and(
      eq(seedMemberTable.snapshotId, snapshot.id),
      ...(input.afterHash
        ? [gt(seedMemberTable.emailHash, input.afterHash)]
        : []),
    ),
    orderBy: asc(seedMemberTable.emailHash),
    limit: (input.limit ?? 1000) + 1,
  });
  const page = rows.slice(0, input.limit ?? 1000);
  return {
    members: page.map((m) => ({
      emailHash: m.emailHash,
      score: m.score,
      evidence: m.evidence,
    })),
    nextAfterHash: rows.length > page.length ? page.at(-1)!.emailHash : null,
  };
}
