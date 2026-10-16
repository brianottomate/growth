import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  emailListTable,
  emailListMemberTable,
  homeTable,
  personaTable,
  seedListTable,
  seedMemberTable,
  seedSnapshotTable,
  platformAudienceTable,
} from "@/server/db/schema";
import { getBigQueryClient } from "@/server/clients/bigquery.client";
import {
  SEED_GUIDELINE_ENTRIES,
  seedDefinitionSchema,
  seedEvidenceScore,
  seedEvidenceCounts,
  selectSeedCandidates,
  type SeedCandidate,
  type SeedDefinition,
  type SeedEvidence,
  type SeedSource,
  type SeedOrigin,
  type SeedTemplateId,
  type SeedQueryParams,
  seedOriginLabel,
} from "@/lib/seed-definition";
import { getWanderMembership } from "@/server/wander-workspace";
import { buildClientSeedQuery, buildWanderSeedQuery } from "./query";
import { resolveSeedContacts, type SeedContact } from "./contacts";
import { suggestSeeds } from "./suggestions";

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
  warning:
    s.diagnostics.contacts === undefined
      ? "Built before contacts were stored: rebuild before uploading."
      : s.diagnostics.contacts.identifiable < SEED_GUIDELINE_ENTRIES
        ? `${s.diagnostics.contacts.identifiable} uploadable ${s.diagnostics.contacts.identifiable === 1 ? "entry" : "entries"}; Meta usually needs about ${SEED_GUIDELINE_ENTRIES.toLocaleString("en-US")} for a useful lookalike.`
        : null,
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
        forBrandId: platformAudienceTable.forBrandId,
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
        // Seed assets live in Wander's account; the snapshot link scopes them.
        where: inArray(
          platformAudienceTable.parentPlatformAudienceId,
          assets.map((a) => a.id),
        ),
        columns: {
          id: true,
          name: true,
          adAccountId: true,
          seedSnapshotId: true,
          parentPlatformAudienceId: true,
          externalId: true,
          forBrandId: true,
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
  return brand;
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
/** Freeze one build of a list from the filters given; contacts are stored with it. */
async function freezeQueryBuild(
  list: { id: string; brandId: string },
  definition: SeedDefinition,
  actor: SeedActor,
) {
  const result = await collectSeed(
    { brandId: list.brandId, definition },
    actor,
  );
  const contacts = await resolveSeedContacts(
    result.members.map((m) => m.emailHash),
    result.definition,
  );
  // Membership and its count appear atomically; an interrupted build leaves no partial snapshot.
  return withTransaction(async (tx) => {
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
          contacts: contactCounts(contacts.values()),
        },
      })
      .returning();
    for (let i = 0; i < result.members.length; i += 1000)
      await tx.insert(seedMemberTable).values(
        result.members.slice(i, i + 1000).map((m) => ({
          ...m,
          ...contacts.get(m.emailHash),
          snapshotId: saved!.id,
        })),
      );
    return saved!;
  });
}

/** Copy an email list's people into one frozen build; later list changes do not follow. */
async function freezeCopyBuild(
  list: { id: string; brandId: string },
  emailListId: string,
) {
  const source = await db.query.emailListTable.findFirst({
    where: and(
      eq(emailListTable.id, emailListId),
      eq(emailListTable.brandId, list.brandId),
    ),
  });
  if (!source) throw new Error("Email list not found on this brand");
  const rows = await db.query.emailListMemberTable.findMany({
    where: eq(emailListMemberTable.listId, source.id),
    columns: { email: true, firstName: true, lastName: true },
  });
  const copiedAt = new Date();
  const definition: SeedSource = {
    kind: "copy",
    from: { type: "email_list", listId: source.id, listName: source.name },
    copiedAt: copiedAt.toISOString(),
  };
  const members = [
    ...new Map(
      rows.map((r) => {
        const email = r.email.trim().toLowerCase();
        return [
          seedEmailHash(email),
          {
            email,
            firstName: r.firstName?.trim() || null,
            lastName: r.lastName?.trim() || null,
          },
        ] as const;
      }),
    ),
  ];
  const evidence: SeedEvidence[] = [
    {
      source: `email_list:${source.id}`,
      search: null,
      score: 100,
      ring: 0,
      bookings: 0,
      views: 0,
      dates: 0,
      checkouts: 0,
    },
  ];
  return withTransaction(async (tx) => {
    const [snapshot] = await tx
      .insert(seedSnapshotTable)
      .values({
        seedListId: list.id,
        definition,
        asOf: copiedAt,
        memberCount: members.length,
        diagnostics: {
          expansion: [],
          goalMet: null,
          candidateCount: rows.length,
          excludedCount: 0,
          sources: [
            {
              name: `email_list:${source.id}`,
              rows: rows.length,
              jobId: null,
              bytesProcessed: null,
            },
          ],
          queries: [],
          contacts: { identifiable: members.length, phones: 0 },
        },
      })
      .returning();
    for (let i = 0; i < members.length; i += 1000)
      await tx.insert(seedMemberTable).values(
        members.slice(i, i + 1000).map(([emailHash, contact]) => ({
          snapshotId: snapshot!.id,
          emailHash,
          score: 100,
          evidence,
          ...contact,
        })),
      );
    return snapshot!;
  });
}

const median = (values: number[]) => {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)]! : null;
};

/** The filters a fixed template runs for this brand today. */
async function templateQuery(
  origin: SeedOrigin,
  brand: { id: string; name: string },
  actor: SeedActor,
): Promise<SeedDefinition> {
  if (origin.template === "past_bookers")
    return seedDefinitionSchema.parse({ clientBookers: true, minScore: 100 });
  if (origin.template === "persona" || origin.template === "described") {
    const steer =
      origin.template === "persona"
        ? await personaSteer(origin.personaId, brand.id)
        : origin.steer;
    const [proposal] = await suggestSeeds(
      { brandId: brand.id, steer: `Propose exactly one seed. ${steer}` },
      actor,
    );
    if (!proposal) throw new Error("No seed filters could be made from that");
    return proposal.definition;
  }
  if (origin.template === "email_list")
    throw new Error("An email list copy has no filters");
  const homes = await db.query.homeTable.findMany({
    where: and(eq(homeTable.brandId, brand.id), isNull(homeTable.deletedAt)),
    columns: { city: true, state: true, bedrooms: true, guests: true },
  });
  if (!homes.length) throw new Error(`${brand.name} has no homes yet`);
  const filter =
    origin.template === "destinations"
      ? {
          cities: [...new Set(homes.flatMap((h) => (h.city ? [h.city] : [])))],
          states: [
            ...new Set(homes.flatMap((h) => (h.state ? [h.state] : []))),
          ],
        }
      : {
          minBedrooms: median(homes.map((h) => h.bedrooms ?? 0)),
          minOccupancy: median(homes.map((h) => h.guests ?? 0)),
        };
  return seedDefinitionSchema.parse({
    wander: true,
    minScore: 45,
    searches: [
      {
        key: origin.template,
        why:
          origin.template === "destinations"
            ? `Travelers interested in ${brand.name}'s towns`
            : `Travelers drawn to homes the size of ${brand.name}'s`,
        filter,
      },
    ],
  });
}

async function personaSteer(personaId: string, brandId: string) {
  const persona = await db.query.personaTable.findFirst({
    where: and(
      eq(personaTable.id, personaId),
      eq(personaTable.brandId, brandId),
      isNull(personaTable.deletedAt),
    ),
    columns: { name: true, description: true },
  });
  if (!persona) throw new Error("Persona not found on this brand");
  return `Find travelers who fit this persona. ${persona.name}: ${persona.description ?? ""}`;
}

async function resolveOrigin(
  input: {
    template: SeedTemplateId;
    personaId?: string;
    steer?: string;
    emailListId?: string;
  },
  brandId: string,
): Promise<SeedOrigin> {
  switch (input.template) {
    case "persona": {
      if (!input.personaId) throw new Error("Choose a persona");
      const persona = await db.query.personaTable.findFirst({
        where: and(
          eq(personaTable.id, input.personaId),
          eq(personaTable.brandId, brandId),
          isNull(personaTable.deletedAt),
        ),
        columns: { id: true, name: true },
      });
      if (!persona) throw new Error("Persona not found on this brand");
      return {
        template: "persona",
        personaId: persona.id,
        personaName: persona.name,
      };
    }
    case "described":
      if (!input.steer?.trim()) throw new Error("Describe who the seed is for");
      return { template: "described", steer: input.steer.trim() };
    case "email_list": {
      if (!input.emailListId) throw new Error("Choose an email list");
      const list = await db.query.emailListTable.findFirst({
        where: and(
          eq(emailListTable.id, input.emailListId),
          eq(emailListTable.brandId, brandId),
        ),
        columns: { id: true, name: true },
      });
      if (!list) throw new Error("Email list not found on this brand");
      return { template: "email_list", listId: list.id, listName: list.name };
    }
    default:
      return { template: input.template };
  }
}

/** Make a seed list from a starting point and build it straight away. */
export async function buildSeed(
  input: {
    brandId: string;
    template: SeedTemplateId;
    personaId?: string;
    steer?: string;
    emailListId?: string;
    name?: string;
  },
  actor: SeedActor,
) {
  const brand = await requireSeedBrand(input.brandId, actor);
  const origin = await resolveOrigin(input, brand.id);
  const definition =
    origin.template === "email_list"
      ? null
      : await templateQuery(origin, brand, actor);
  const [list] = await db
    .insert(seedListTable)
    .values({
      brandId: brand.id,
      name: input.name?.trim() || seedOriginLabel(origin),
      origin,
    })
    .returning();
  const snapshot =
    origin.template === "email_list"
      ? await freezeCopyBuild(list!, origin.listId)
      : await freezeQueryBuild(list!, definition!, actor);
  return { list: listSummary(list!), snapshot: seedSnapshotSummary(snapshot) };
}

/**
 * Build a list again. Fixed templates run against today's homes and data; AI
 * origins reuse the last build's filters so counts stay comparable; a copy
 * copies its email list again.
 */
export async function rebuildSeed(
  input: { seedListId: string },
  actor: SeedActor,
) {
  const { list, brand } = await requireSeedList(input.seedListId, actor);
  const origin = list.origin;
  let snapshot;
  if (origin.template === "email_list")
    snapshot = await freezeCopyBuild(list, origin.listId);
  else {
    const last = await db.query.seedSnapshotTable.findFirst({
      where: eq(seedSnapshotTable.seedListId, list.id),
      orderBy: desc(seedSnapshotTable.createdAt),
    });
    const reuse =
      (origin.template === "persona" || origin.template === "described") &&
      last?.definition.kind !== "copy"
        ? last?.definition
        : undefined;
    snapshot = await freezeQueryBuild(
      list,
      reuse ?? (await templateQuery(origin, brand, actor)),
      actor,
    );
  }
  await db
    .update(seedListTable)
    .set({ updatedAt: new Date() })
    .where(eq(seedListTable.id, list.id));
  return seedSnapshotSummary(snapshot);
}

const contactCounts = (contacts: Iterable<SeedContact>) => {
  let identifiable = 0,
    phones = 0;
  for (const c of contacts) {
    if (c.email || c.phone) identifiable += 1;
    if (c.phone) phones += 1;
  }
  return { identifiable, phones };
};

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
