/**
 * Backfill `growth_pregen_preview_url` on companies whose build predates the
 * webhook writing it.
 *
 * The sequence's "See your preview" merge field went unwritten by any code until
 * 2026-08-21, so every link that works was stamped by hand. The webhook now
 * writes it on READY, but only for builds from that point on: a company built
 * before it would mail a tracker with no target, and HubSpot counts that as a
 * click, so nothing in the reporting says so.
 *
 * Fills blanks only. A company that already has a value keeps it — a bespoke
 * publish writes its own `pregen_sites` link there and must not be clobbered by
 * this arm's.
 *
 * The link comes from `lead_domain.pregenSiteUrl`, which is what the webhook
 * writes and what the send gate checks, so a rebuild resolves to the build that
 * actually won rather than to whichever row is newest.
 *
 *   bun --conditions=react-server scripts/backfill-pregen-preview-urls.ts
 *   bun --conditions=react-server scripts/backfill-pregen-preview-urls.ts --apply
 */
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";

import { outreachLinkFor } from "@/lib/pregen-urls";
import { env } from "@/env";
import { updateCompany } from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import { leadDomainTable, pregenBuildTable } from "@/server/db/leads-schema";

const apply = process.argv.includes("--apply");

const rows = await db
  .selectDistinct({
    domain: leadDomainTable.domain,
    companyId: leadDomainTable.hubspotRecordId,
    previewUrl: leadDomainTable.pregenSiteUrl,
    excluded: leadDomainTable.excludeFromOutreach,
  })
  .from(leadDomainTable)
  .innerJoin(
    pregenBuildTable,
    eq(pregenBuildTable.domainId, leadDomainTable.id),
  )
  .where(
    and(
      eq(pregenBuildTable.status, "READY"),
      isNull(leadDomainTable.deletedAt),
      isNotNull(leadDomainTable.hubspotRecordId),
      isNotNull(leadDomainTable.pregenSiteUrl),
      ne(leadDomainTable.pregenSiteUrl, ""),
    ),
  );

/** One request for the lot, rather than a read per company. */
async function readExisting(ids: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let index = 0; index < ids.length; index += 100) {
    const response = await fetch(
      "https://api.hubapi.com/crm/v3/objects/companies/batch/read",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.HUBSPOT_ACCESS_TOKEN_OPERATED}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: ["growth_pregen_preview_url"],
          inputs: ids.slice(index, index + 100).map((id) => ({ id })),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Batch read failed: ${response.status} ${await response.text()}`,
      );
    }
    const body = (await response.json()) as {
      results: { id: string; properties: Record<string, string | null> }[];
    };
    for (const result of body.results) {
      const value = result.properties.growth_pregen_preview_url;
      if (value) found.set(result.id, value);
    }
  }
  return found;
}

const existing = await readExisting(rows.map((row) => row.companyId!));

let written = 0;
let alreadySet = 0;
let failed = 0;

for (const row of rows.sort((a, b) => a.domain.localeCompare(b.domain))) {
  if (existing.has(row.companyId!)) {
    alreadySet += 1;
    continue;
  }
  const link = outreachLinkFor(row.previewUrl!, row.domain, {
    campaign: "pregen_blast",
  });
  console.log(
    `${apply ? "stamp" : "would stamp"} ${row.domain}${row.excluded ? " (excluded from outreach)" : ""}`,
  );
  console.log(`      ${link}`);
  if (!apply) {
    written += 1;
    continue;
  }
  try {
    await updateCompany(row.companyId!, { growth_pregen_preview_url: link });
    written += 1;
  } catch (error) {
    failed += 1;
    console.warn(
      `      FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

console.log(
  `\n${rows.length} READY companies · ${alreadySet} already set · ${
    apply ? `${written} stamped` : `${written} would be stamped`
  }${failed ? ` · ${failed} failed` : ""}.${apply ? "" : " Re-run with --apply to write."}`,
);
process.exit(0);
