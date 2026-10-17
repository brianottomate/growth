import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  emailListTable,
  emailListMemberTable,
  homeTable,
  personaTable,
  seedListTable,
} from "@/server/db/schema";
import { getBigQueryClient } from "@/server/clients/bigquery.client";
import {
  SEED_GUIDELINE_ENTRIES,
  seedDefinitionSchema,
  seedOriginLabel,
  selectSeedMembers,
  type SeedBuildSummary,
  type SeedDefinition,
  type SeedMember,
  type SeedOrigin,
  type SeedSignal,
  type SeedTemplateId,
} from "@/lib/seed-definition";
import { getWanderMembership } from "@/server/wander-workspace";
import { buildClientSeedQuery, buildWanderSeedQuery } from "./query";
import { resolveSeedContacts } from "./contacts";
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
export async function requireWanderSeedSource(actor: SeedActor) {
  const membership = await getWanderMembership(actor.userId);
  if (membership?.organizationId !== actor.organizationId)
    throw new Error(
      "Wander warehouse audience data is not available in this workspace",
    );
}

export const seedWarning = (identifiable: number) =>
  identifiable < SEED_GUIDELINE_ENTRIES
    ? `${identifiable.toLocaleString("en-US")} ${identifiable === 1 ? "person" : "people"} with an email or phone; Meta usually needs about ${SEED_GUIDELINE_ENTRIES.toLocaleString("en-US")} for a useful lookalike.`
    : null;

type SeedListRow = Omit<typeof seedListTable.$inferSelect, "members">;

/** A list without its members: what every reader needs. */
export function seedListSummary(list: SeedListRow) {
  return {
    id: list.id,
    brandId: list.brandId,
    name: list.name,
    origin: list.origin,
    definition: list.definition,
    memberCount: list.memberCount,
    summary: list.summary,
    builtFrom: seedOriginLabel(list.origin),
    warning: seedWarning(list.summary.identifiable),
    builtAt: list.builtAt.toISOString(),
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

export async function listSeeds(input: { brandId: string }, actor: SeedActor) {
  await requireSeedBrand(input.brandId, actor);
  const lists = await db.query.seedListTable.findMany({
    where: eq(seedListTable.brandId, input.brandId),
    orderBy: desc(seedListTable.updatedAt),
    columns: { members: false },
  });
  return lists.map(seedListSummary);
}

const signal = z.object({
  email_hash: z.string().regex(/^[a-f0-9]{64}$/),
  bookings: z.coerce.number().nonnegative(),
  views: z.coerce.number().nonnegative().optional(),
  dates: z.coerce.number().nonnegative().optional(),
  checkouts: z.coerce.number().nonnegative().optional(),
});

function summarize(
  members: SeedMember[],
  candidates: number,
  evidence: SeedBuildSummary["evidence"],
): SeedBuildSummary {
  return {
    candidates,
    evidence,
    identifiable: members.filter((m) => m.email || m.phone).length,
    phones: members.filter((m) => m.phone).length,
  };
}

/** Run the filters against BigQuery and return the people with their contacts. */
async function runQueryBuild(
  brand: { wanderOsWebsiteId: string | null },
  d: SeedDefinition,
  actor: SeedActor,
) {
  if (d.wander) await requireWanderSeedSource(actor);
  if (d.clientBookers && !brand.wanderOsWebsiteId)
    throw new Error("This brand has no WanderOS website");
  const asOf = new Date().toISOString();
  const queries = [
    ...(d.clientBookers
      ? [buildClientSeedQuery(brand.wanderOsWebsiteId!, asOf)]
      : []),
    ...(d.wander ? [buildWanderSeedQuery(d, asOf)] : []),
  ];
  const client = await getBigQueryClient();
  const signals: SeedSignal[] = [];
  for (const query of queries) {
    const [job] = await client.createQueryJob({
      query: query.sql,
      params: query.params,
      location: "us-central1",
      maximumBytesBilled: "20000000000",
    });
    const [rows] = (await job.getQueryResults()) as [unknown[]];
    for (const raw of rows) {
      const r = signal.parse(raw);
      signals.push({
        emailHash: r.email_hash,
        bookings: r.bookings,
        views: r.views ?? 0,
        dates: r.dates ?? 0,
        checkouts: r.checkouts ?? 0,
      });
    }
  }
  const selected = selectSeedMembers(signals, d.minScore);
  const contacts = await resolveSeedContacts(selected.hashes, d);
  const members: SeedMember[] = selected.hashes.map((emailHash) => ({
    emailHash,
    email: null,
    phone: null,
    firstName: null,
    lastName: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    ...contacts.get(emailHash),
  }));
  return {
    members,
    summary: summarize(members, selected.candidates, selected.evidence),
  };
}

/** Copy an email list's people in. The list does not follow later changes. */
async function copyEmailList(brandId: string, emailListId: string) {
  const source = await db.query.emailListTable.findFirst({
    where: and(
      eq(emailListTable.id, emailListId),
      eq(emailListTable.brandId, brandId),
    ),
  });
  if (!source) throw new Error("Email list not found on this brand");
  const rows = await db.query.emailListMemberTable.findMany({
    where: eq(emailListMemberTable.listId, source.id),
    columns: { email: true, firstName: true, lastName: true },
  });
  const byHash = new Map<string, SeedMember>();
  for (const r of rows) {
    const email = r.email.trim().toLowerCase();
    const emailHash = seedEmailHash(email);
    byHash.set(emailHash, {
      emailHash,
      email,
      phone: null,
      firstName: r.firstName?.trim() || null,
      lastName: r.lastName?.trim() || null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    });
  }
  const members = [...byHash.values()];
  return {
    members,
    summary: summarize(members, rows.length, {
      bookers: 0,
      checkouts: 0,
      dates: 0,
      views: 0,
    }),
  };
}

const median = (values: number[]) => {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)]! : null;
};

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

/** The filters a template runs for this brand. AI templates write them once. */
async function templateDefinition(
  origin: Exclude<SeedOrigin, { template: "email_list" }>,
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
      const persona = input.personaId
        ? await db.query.personaTable.findFirst({
            where: and(
              eq(personaTable.id, input.personaId),
              eq(personaTable.brandId, brandId),
              isNull(personaTable.deletedAt),
            ),
            columns: { id: true, name: true },
          })
        : null;
      if (!persona) throw new Error("Choose one of the brand's personas");
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
      const list = input.emailListId
        ? await db.query.emailListTable.findFirst({
            where: and(
              eq(emailListTable.id, input.emailListId),
              eq(emailListTable.brandId, brandId),
            ),
            columns: { id: true, name: true },
          })
        : null;
      if (!list) throw new Error("Choose one of the brand's email lists");
      return { template: "email_list", listId: list.id, listName: list.name };
    }
    default:
      return { template: input.template };
  }
}

async function runBuild(
  origin: SeedOrigin,
  reuse: SeedDefinition | null,
  brand: { id: string; name: string; wanderOsWebsiteId: string | null },
  actor: SeedActor,
) {
  if (origin.template === "email_list")
    return {
      definition: null,
      ...(await copyEmailList(brand.id, origin.listId)),
    };
  const definition = reuse ?? (await templateDefinition(origin, brand, actor));
  const build = await runQueryBuild(brand, definition, actor);
  // AI-made filters aim at 1,000+ people; one that comes out small gets its
  // place filters dropped and runs once more across all of Wander's homes.
  const placed = definition.searches.some(
    (s) => s.filter.cities.length || s.filter.states.length,
  );
  if (
    !reuse &&
    (origin.template === "persona" || origin.template === "described") &&
    build.summary.identifiable < SEED_GUIDELINE_ENTRIES &&
    placed
  ) {
    const wider = seedDefinitionSchema.parse({
      ...definition,
      searches: definition.searches.map((s) => ({
        ...s,
        filter: { ...s.filter, cities: [], states: [] },
      })),
    });
    const widened = await runQueryBuild(brand, wider, actor);
    if (widened.summary.identifiable > build.summary.identifiable)
      return { definition: wider, ...widened };
  }
  return { definition, ...build };
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
  const build = await runBuild(origin, null, brand, actor);
  const list = await withTransaction(async (tx) => {
    const [row] = await tx
      .insert(seedListTable)
      .values({
        brandId: brand.id,
        name: input.name?.trim() || seedOriginLabel(origin),
        origin,
        definition: build.definition,
        members: build.members,
        memberCount: build.members.length,
        summary: build.summary,
        builtAt: new Date(),
      })
      .returning();
    return row!;
  });
  return seedListSummary(list);
}

/**
 * Build the list again in place. Fixed templates run on today's homes and
 * data; AI-made filters are reused; an email list is copied again. Meta keeps
 * whatever was uploaded before.
 */
export async function refreshSeed(
  input: { seedListId: string },
  actor: SeedActor,
) {
  const { list, brand } = await requireSeedList(input.seedListId, actor);
  const reuse =
    list.origin.template === "persona" || list.origin.template === "described"
      ? list.definition
      : null;
  const build = await runBuild(list.origin, reuse, brand, actor);
  const saved = await withTransaction(async (tx) => {
    const [row] = await tx
      .update(seedListTable)
      .set({
        definition: build.definition,
        members: build.members,
        memberCount: build.members.length,
        summary: build.summary,
        builtAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(seedListTable.id, list.id))
      .returning();
    return row!;
  });
  return seedListSummary(saved);
}
