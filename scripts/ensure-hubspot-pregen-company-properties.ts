/**
 * The pregen token surface, on the company it describes.
 *
 * The site is one per domain and the reviewed copy attributes every fact to
 * whoever said it, so the only per-person token left is the first name HubSpot
 * puts in the greeting. Everything else belongs to the company: any enrolled
 * contact renders it, and it survives that contact changing jobs.
 *
 * It was built contact-first so a sequence token would resolve without
 * depending on an association. Verified 2026-08-17: every pregen-2 contact has
 * exactly one primary company association, so that hedge bought nothing and
 * cost real duplication (stamp-blast-preview-urls.ts writes one company-level
 * URL onto 19 contacts to keep it in sync).
 *
 * Additive. The contact properties stay populated, so a template already
 * written against them keeps working while the company tokens take over.
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

/**
 * The whole reviewed sequence lives here, on the company it was written about.
 * Touch 1 splits around the link so the sequence step can render a hyperlink
 * from the URL property instead of a bare address; touches 2 to 4 are in-thread
 * and carry no subject and no link of their own.
 */
const PROPERTIES = [
  {
    name: "growth_pregen_preview_url",
    label: "Growth pregen preview URL",
    type: "string",
    fieldType: "text",
    description:
      "The wander.com pitch wrapper for this company's pre-generated site, carrying its signed token and campaign attribution. One per company; sequences read it as a personalization token.",
  },
  {
    name: "growth_pregen_inspect_url",
    label: "Growth pregen inspect URL",
    type: "string",
    fieldType: "text",
    description:
      "The same pitch page with the view beacon off (?noping=1), for reps opening it from the CRM. Never send this one: the beacon on growth_pregen_inspect_url's sibling is what tells sales the prospect is looking.",
  },
  {
    name: "growth_pregen_touch_1_subject",
    label: "Growth pregen touch 1 subject",
    type: "string",
    fieldType: "text",
    description:
      "Reviewed subject line for touch 1. Touches 2 to 4 reply in-thread and have none.",
  },
  {
    name: "growth_pregen_touch_1_opening",
    label: "Growth pregen touch 1 opening",
    type: "string",
    fieldType: "textarea",
    description: "Reviewed touch 1 copy above the preview link.",
  },
  {
    name: "growth_pregen_touch_1_closing",
    label: "Growth pregen touch 1 closing",
    type: "string",
    fieldType: "textarea",
    description:
      "Reviewed touch 1 copy below the preview link, ending in the question.",
  },
  {
    name: "growth_pregen_touch_2_body",
    label: "Growth pregen touch 2 body",
    type: "string",
    fieldType: "textarea",
    description: "Reviewed touch 2, in-thread.",
  },
  {
    name: "growth_pregen_touch_3_body",
    label: "Growth pregen touch 3 body",
    type: "string",
    fieldType: "textarea",
    description: "Reviewed touch 3, in-thread.",
  },
  {
    name: "growth_pregen_touch_4_body",
    label: "Growth pregen touch 4 body",
    type: "string",
    fieldType: "textarea",
    description: "Reviewed touch 4, in-thread.",
  },
] as const;

const PROPERTY = PROPERTIES[0];

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

for (const property of PROPERTIES) {
  const existing = await hubspot(
    `/crm/v3/properties/companies/${encodeURIComponent(property.name)}`,
  );
  if (existing.ok) {
    console.log(`property ${property.name}: exists`);
    continue;
  }
  const created = await hubspot("/crm/v3/properties/companies", {
    method: "POST",
    body: JSON.stringify({ ...property, groupName: GROUP.name }),
  });
  console.log(
    `property ${property.name}: ${created.ok ? "created" : `FAILED ${created.status} ${JSON.stringify(created.data)}`}`,
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
