/**
 * Put the preview URL where it belongs: on the company.
 *
 * The pregen site is one per domain and never varies by person, but the token
 * surface was built contact-first so a sequence token would resolve without
 * depending on an association. The cost of that is visible in
 * stamp-blast-preview-urls.ts, which writes the same URL onto every reachable
 * contact to keep one company-level fact in sync. Verified 2026-08-17: every
 * pregen-2 contact has exactly one primary company association, so a company
 * token resolves and the duplication is no longer buying anything.
 *
 * Additive on purpose. The contact property stays and stays populated, so a
 * template already written against it keeps working; this just makes the more
 * correct token available. Person-level copy (the touch bodies, addressed to
 * one named recipient) stays on the contact where it belongs.
 *
 *   bun --conditions=react-server scripts/ensure-hubspot-pregen-company-properties.ts
 *   bun --conditions=react-server scripts/ensure-hubspot-pregen-company-properties.ts --stamp
 *   bun --conditions=react-server scripts/ensure-hubspot-pregen-company-properties.ts --stamp --batch pregen-2
 */
import { and, eq, isNull, isNotNull } from "drizzle-orm";

import { env } from "@/env";
import { CURRENT_PREGEN_BATCH } from "@/lib/pregen-batch";
import { outreachLinkFor } from "@/lib/pregen-urls";
import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/leads-schema";

const token = env.HUBSPOT_ACCESS_TOKEN_OPERATED;
if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED is not configured");

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const stamp = process.argv.includes("--stamp");
const batch = arg("batch") ?? CURRENT_PREGEN_BATCH;

const GROUP = { name: "growth_pregen_sites", label: "Growth - Pre-Gen Sites" };

const PROPERTY = {
  name: "growth_pregen_preview_url",
  label: "Growth pregen preview URL",
  type: "string",
  fieldType: "text",
  description:
    "The wander.com pitch wrapper for this company's pre-generated site, carrying its signed token and campaign attribution. One per company; sequences read it as a personalization token.",
};

async function hubspot<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    data: text ? (JSON.parse(text) as T) : null,
  };
}

// The group already exists for contacts; company property groups are a separate
// namespace, so it has to be created again on this object type.
const groups = await hubspot<{ results?: Array<{ name: string }> }>(
  "/crm/v3/properties/companies/groups",
);
if (!groups.data?.results?.some((group) => group.name === GROUP.name)) {
  const created = await hubspot("/crm/v3/properties/companies/groups", {
    method: "POST",
    body: JSON.stringify({ name: GROUP.name, label: GROUP.label }),
  });
  console.log(`group ${GROUP.name}: ${created.ok ? "created" : "FAILED"}`);
} else {
  console.log(`group ${GROUP.name}: exists`);
}

const existing = await hubspot(
  `/crm/v3/properties/companies/${encodeURIComponent(PROPERTY.name)}`,
);
if (existing.ok) {
  console.log(`property ${PROPERTY.name}: exists`);
} else {
  const created = await hubspot("/crm/v3/properties/companies", {
    method: "POST",
    body: JSON.stringify({ ...PROPERTY, groupName: GROUP.name }),
  });
  console.log(
    `property ${PROPERTY.name}: ${created.ok ? "created" : `FAILED ${created.status} ${JSON.stringify(created.data)}`}`,
  );
}

if (!stamp) {
  console.log("\nPass --stamp to write the URL onto this batch's companies.");
  process.exit(0);
}

const domains = await db
  .select({
    domain: leadDomainTable.domain,
    pregenSiteUrl: leadDomainTable.pregenSiteUrl,
    hubspotRecordId: leadDomainTable.hubspotRecordId,
    excludeFromOutreach: leadDomainTable.excludeFromOutreach,
  })
  .from(leadDomainTable)
  .where(
    and(
      eq(leadDomainTable.pregenBatch, batch),
      isNotNull(leadDomainTable.pregenSiteUrl),
      isNull(leadDomainTable.deletedAt),
    ),
  );

console.log(`\n${batch}: ${domains.length} domain(s) with previews\n`);

let stamped = 0;
for (const row of domains) {
  if (row.excludeFromOutreach) {
    console.log(`skip  ${row.domain}: excluded from outreach`);
    continue;
  }
  if (!row.hubspotRecordId) {
    console.log(`skip  ${row.domain}: no linked HubSpot company`);
    continue;
  }
  const link = outreachLinkFor(row.pregenSiteUrl!, row.domain, {
    campaign: "pregen_blast",
  });
  const written = await hubspot(
    `/crm/v3/objects/companies/${row.hubspotRecordId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ properties: { [PROPERTY.name]: link } }),
    },
  );
  console.log(
    `${written.ok ? "stamp" : "FAIL "} ${row.domain} → ${row.hubspotRecordId}`,
  );
  if (written.ok) stamped += 1;
}

console.log(`\nstamped ${stamped} company/companies`);
process.exit(0);
