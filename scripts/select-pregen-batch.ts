/**
 * Pick a pregen send batch and stamp it onto leads.domain.pregen_batch.
 *
 *   bun --conditions=react-server scripts/select-pregen-batch.ts --dry
 *   bun --conditions=react-server scripts/select-pregen-batch.ts
 *   bun --conditions=react-server scripts/select-pregen-batch.ts --batch pregen-2 --seed 7
 *
 * Random selection, per Kristian: the untouched cohort is already gated to
 * 10-12 units by the HubSpot list itself, so ranking 499 to pick 25 out of ~341
 * equally-qualified leads buys nothing. The ranker runs afterwards to flag any
 * that score badly, and those get replaced.
 *
 * Recycled is round-robin across owning AEs rather than concentrated on one.
 * Danny's instinct was to pick a single AE, and Karolina is the only book that
 * could fill 25 alone — but round-robin is what we want to be able to support,
 * so this deals one lead per AE per pass. Uneven by necessity: only ~50 recycled
 * companies are enrollable at all.
 *
 * Deterministic for a given --seed so a batch can be re-derived and reviewed.
 * Idempotent: clears this batch label before re-stamping.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  hubspotListMembershipTable,
  leadDomainTable,
} from "@/server/db/leads-schema";

const apply = !process.argv.includes("--dry");
function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? (process.argv[idx + 1] ?? fallback) : fallback;
}

const BATCH = arg("batch", "pregen-1");
const SEED = Number(arg("seed", "1"));
const PER_COHORT = Number(arg("size", "25"));

/** Deterministic PRNG so a seed reproduces the same batch. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(SEED);

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

type Candidate = {
  id: string;
  domain: string;
  owner: string | null;
  units: number | null;
  pms: string | null;
  integrated: boolean | null;
};

/**
 * Eligible = in the cohort, not suppressed, and actually enrollable today:
 * a live contact with an email, a HubSpot contact id, and no mirrored opt-out.
 * Same predicate the /leads enrollable filter uses — a batch we cannot email is
 * not a batch.
 */
async function candidates(cohort: "recycled" | "untouched") {
  return db
    .select({
      id: leadDomainTable.id,
      domain: leadDomainTable.domain,
      owner: leadDomainTable.hubspotOwner,
      units: leadDomainTable.unitCount,
      pms: leadDomainTable.pms,
      integrated: leadDomainTable.isIntegratedPms,
    })
    .from(leadDomainTable)
    .innerJoin(
      hubspotListMembershipTable,
      and(
        eq(hubspotListMembershipTable.domainId, leadDomainTable.id),
        eq(hubspotListMembershipTable.objectType, "company"),
        eq(hubspotListMembershipTable.cohort, cohort),
      ),
    )
    .where(
      and(
        eq(leadDomainTable.excludeFromOutreach, false),
        isNull(leadDomainTable.deletedAt),
        sql`exists (
          select 1 from leads.contact c
          where c.domain_id = ${leadDomainTable.id}
            and c.deleted_at is null
            and c.hubspot_contact_id is not null
            and nullif(btrim(c.email), '') is not null
            and coalesce(c.email_opt_out, false) = false
        )`,
      ),
    );
}

/** One per AE per pass, so no single rep's book carries the batch. */
function roundRobinByOwner(rows: Candidate[], take: number): Candidate[] {
  const byOwner = new Map<string, Candidate[]>();
  for (const row of shuffle(rows)) {
    const key = row.owner ?? "(unassigned)";
    byOwner.set(key, [...(byOwner.get(key) ?? []), row]);
  }
  // Largest books first, so the deal order does not depend on Map insertion.
  const queues = [...byOwner.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([owner, items]) => ({ owner, items }));

  const picked: Candidate[] = [];
  let progressed = true;
  while (picked.length < take && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (picked.length >= take) break;
      const next = queue.items.shift();
      if (next) {
        picked.push(next);
        progressed = true;
      }
    }
  }
  return picked;
}

const untouchedPool = await candidates("untouched");
const recycledPool = await candidates("recycled");

// Untouched: integrated PMS only. Danny confirmed WanderOS can serve 10-15 unit
// operators, but only where we can actually connect the PMS.
const untouchedEligible = untouchedPool.filter((row) => row.integrated);

const untouchedPick = shuffle(untouchedEligible).slice(0, PER_COHORT);
const recycledPick = roundRobinByOwner(recycledPool, PER_COHORT);

function summarize(label: string, rows: Candidate[], poolSize: number) {
  const byOwner = new Map<string, number>();
  const byPms = new Map<string, number>();
  for (const row of rows) {
    const owner = row.owner ?? "(unassigned)";
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
    byPms.set(row.pms ?? "(unknown)", (byPms.get(row.pms ?? "(unknown)") ?? 0) + 1);
  }
  return {
    label,
    picked: rows.length,
    requested: PER_COHORT,
    eligiblePool: poolSize,
    shortfall: Math.max(0, PER_COHORT - rows.length),
    byOwner: Object.fromEntries([...byOwner].sort((a, b) => b[1] - a[1])),
    byPms: Object.fromEntries([...byPms].sort((a, b) => b[1] - a[1])),
    units: rows.length
      ? {
          min: Math.min(...rows.map((r) => r.units ?? 0)),
          max: Math.max(...rows.map((r) => r.units ?? 0)),
        }
      : null,
  };
}

console.log(
  JSON.stringify(
    {
      batch: BATCH,
      seed: SEED,
      mode: apply ? "apply" : "dry",
      untouched: summarize("untouched", untouchedPick, untouchedEligible.length),
      recycled: summarize("recycled", recycledPick, recycledPool.length),
    },
    null,
    2,
  ),
);

if (!apply) {
  console.log("\n(dry run — nothing stamped)");
  process.exit(0);
}

const ids = [...untouchedPick, ...recycledPick].map((row) => row.id);

// Idempotent: drop the previous membership for this label before re-stamping, so
// re-running with a new seed replaces the batch instead of growing it.
await db
  .update(leadDomainTable)
  .set({ pregenBatch: null, updatedAt: new Date() })
  .where(eq(leadDomainTable.pregenBatch, BATCH));

for (let index = 0; index < ids.length; index += 200) {
  await db
    .update(leadDomainTable)
    .set({ pregenBatch: BATCH, updatedAt: new Date() })
    .where(inArray(leadDomainTable.id, ids.slice(index, index + 200)));
}

const [stamped] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(leadDomainTable)
  .where(eq(leadDomainTable.pregenBatch, BATCH));

console.log(
  JSON.stringify({ batch: BATCH, stamped: stamped?.count ?? 0 }, null, 2),
);
