/**
 * Stamp a pre-gen send batch from the MANUAL HubSpot list that defines it.
 *
 *   bun --conditions=react-server scripts/stamp-pregen-batch-from-list.ts --batch pregen-3 --dry
 *   bun --conditions=react-server scripts/stamp-pregen-batch-from-list.ts --batch pregen-3
 *
 * The sibling `select-pregen-batch.ts` picks a batch *out of* the two big
 * dynamic cohorts. This one is for the other shape: Danny curates a list in
 * HubSpot and that list is the batch. See `PREGEN_BATCH_LISTS`.
 *
 * Re-runnable and idempotent — the label is cleared before re-stamping, so a
 * company removed from the HubSpot list drops out of the batch here too.
 *
 * Companies resolve to `leads.domain` by domain first and `hubspot_record_id`
 * second. Record id alone is not enough: at least one CRM company (Island
 * Breeze, 36229446038) is stamped on two domain rows, and stamping both would
 * put a company nobody chose into the send list.
 */
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { env } from "@/env";
import { PREGEN_BATCH_LISTS } from "@/lib/pregen-batch";
import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/leads-schema";

const token = env.HUBSPOT_ACCESS_TOKEN_OPERATED;
if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED is not configured");

const apply = !process.argv.includes("--dry");
function arg(name: string): string | undefined {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const batch = arg("batch");
if (!batch) throw new Error("--batch is required");
const list = PREGEN_BATCH_LISTS[batch];
if (!list) {
  throw new Error(
    `No HubSpot list registered for "${batch}". Add it to PREGEN_BATCH_LISTS.`,
  );
}

async function hubspot<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `HubSpot ${path} -> ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

/** Same normalizer as `import-hubspot-company-export.ts`. */
function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  let domain = value.trim().toLowerCase();
  if (!domain) return null;
  if (domain.includes("://")) domain = domain.split("://")[1]!;
  if (domain.includes("@")) domain = domain.split("@").pop()!;
  for (const separator of ["/", "?", "#"]) {
    if (domain.includes(separator)) domain = domain.split(separator)[0]!;
  }
  if (domain.includes(":")) domain = domain.split(":")[0]!;
  while (domain.startsWith("www.")) domain = domain.slice(4);
  domain = domain.replace(/^\.+|\.+$/g, "").trim();
  return domain || null;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

async function listMemberIds(listId: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  do {
    const page = await hubspot<{
      results?: Array<{ recordId: string }>;
      paging?: { next?: { after?: string } };
    }>(
      `/crm/v3/lists/${listId}/memberships?limit=250${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
    ids.push(...(page.results ?? []).map((row) => String(row.recordId)));
    after = page.paging?.next?.after;
  } while (after);
  return ids;
}

type HubspotCompany = {
  id: string;
  properties: { name?: string | null; domain?: string | null };
};

async function readCompanies(ids: string[]): Promise<HubspotCompany[]> {
  const companies: HubspotCompany[] = [];
  for (const page of chunks(ids, 100)) {
    const result = await hubspot<{ results?: HubspotCompany[] }>(
      "/crm/v3/objects/companies/batch/read",
      {
        method: "POST",
        body: JSON.stringify({
          inputs: page.map((id) => ({ id })),
          properties: ["name", "domain"],
        }),
      },
    );
    companies.push(...(result.results ?? []));
  }
  return companies;
}

const memberIds = await listMemberIds(list.listId);
const companies = await readCompanies(memberIds);

const wantedDomains = [
  ...new Set(
    companies.map((c) => normalizeDomain(c.properties.domain)).filter(Boolean),
  ),
] as string[];

const rows = await db
  .select({
    id: leadDomainTable.id,
    domain: leadDomainTable.domain,
    recordId: leadDomainTable.hubspotRecordId,
    excluded: leadDomainTable.excludeFromOutreach,
    excludeReason: leadDomainTable.excludeReason,
    units: leadDomainTable.unitCount,
    pms: leadDomainTable.pms,
    integrated: leadDomainTable.isIntegratedPms,
    previewUrl: leadDomainTable.pregenSiteUrl,
    owner: leadDomainTable.hubspotOwner,
  })
  .from(leadDomainTable)
  .where(
    and(
      isNull(leadDomainTable.deletedAt),
      or(
        inArray(leadDomainTable.domain, wantedDomains),
        inArray(leadDomainTable.hubspotRecordId, memberIds),
      ),
    ),
  );

const byDomain = new Map(rows.map((r) => [r.domain, r]));
const byRecordId = new Map<string, typeof rows>();
for (const row of rows) {
  if (!row.recordId) continue;
  byRecordId.set(row.recordId, [...(byRecordId.get(row.recordId) ?? []), row]);
}

type Resolution = {
  company: HubspotCompany;
  row: (typeof rows)[number] | null;
  how: string;
};
const resolutions: Resolution[] = companies.map((company) => {
  const domain = normalizeDomain(company.properties.domain);
  const onDomain = domain ? byDomain.get(domain) : undefined;
  if (onDomain) return { company, row: onDomain, how: "domain" };
  const onRecord = byRecordId.get(company.id) ?? [];
  // One CRM company mapped to several domain rows is a merge to make by hand,
  // not a coin flip — the wrong pick sends a stranger's website to a prospect.
  if (onRecord.length === 1)
    return { company, row: onRecord[0]!, how: "record_id" };
  if (onRecord.length > 1)
    return { company, row: null, how: "ambiguous_record_id" };
  return { company, row: null, how: "unmatched" };
});

const matched = resolutions.filter((r) => r.row);
const unresolved = resolutions.filter((r) => !r.row);

const enrollable = matched.length
  ? await db
      .select({ id: leadDomainTable.id })
      .from(leadDomainTable)
      .where(
        and(
          inArray(
            leadDomainTable.id,
            matched.map((r) => r.row!.id),
          ),
          sql`exists (
            select 1 from leads.contact c
            where c.domain_id = ${leadDomainTable.id}
              and c.deleted_at is null
              and c.hubspot_contact_id is not null
              and nullif(btrim(c.email), '') is not null
              and coalesce(c.email_opt_out, false) = false
          )`,
        ),
      )
  : [];
const enrollableIds = new Set(enrollable.map((r) => r.id));

console.log(
  JSON.stringify(
    {
      batch,
      list,
      mode: apply ? "apply" : "dry",
      listMembers: memberIds.length,
      matched: matched.length,
      matchedBy: matched.reduce<Record<string, number>>((acc, r) => {
        acc[r.how] = (acc[r.how] ?? 0) + 1;
        return acc;
      }, {}),
      // Readiness, not gates: the batch is stamped either way and these are the
      // rows a human has to fix before the send list is the send list.
      excluded: matched.filter((r) => r.row!.excluded).length,
      notEnrollable: matched.filter((r) => !enrollableIds.has(r.row!.id))
        .length,
      integratedPms: matched.filter((r) => r.row!.integrated).length,
      alreadyHasPreview: matched.filter((r) => r.row!.previewUrl).length,
      byOwner: matched.reduce<Record<string, number>>((acc, r) => {
        const key = r.row!.owner ?? "(unassigned)";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
      unresolved: unresolved.map((r) => ({
        hubspotCompanyId: r.company.id,
        name: r.company.properties.name,
        domain: r.company.properties.domain,
        reason: r.how,
      })),
    },
    null,
    2,
  ),
);

if (!apply) {
  console.log("\n(dry run — nothing stamped)");
  process.exit(0);
}

await db
  .update(leadDomainTable)
  .set({ pregenBatch: null, updatedAt: new Date() })
  .where(eq(leadDomainTable.pregenBatch, batch));

const ids = matched.map((r) => r.row!.id);
for (let i = 0; i < ids.length; i += 200) {
  await db
    .update(leadDomainTable)
    .set({ pregenBatch: batch, updatedAt: new Date() })
    .where(inArray(leadDomainTable.id, ids.slice(i, i + 200)));
}

const [stamped] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(leadDomainTable)
  .where(eq(leadDomainTable.pregenBatch, batch));

console.log(JSON.stringify({ batch, stamped: stamped?.count ?? 0 }, null, 2));
