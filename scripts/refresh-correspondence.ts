/**
 * Recompute the stored correspondence blob for a pregen batch.
 *
 * Ranking and generation both refresh it as a side effect, but each costs an
 * LLM run. This does only the HubSpot read + summarize + merge, for when the
 * blob's shape changes (excerpts added 2026-08-17) and the UI needs the new
 * fields without regenerating anything.
 *
 *   bun --conditions=react-server scripts/refresh-correspondence.ts
 *   bun --conditions=react-server scripts/refresh-correspondence.ts --batch pregen-2
 */
import { and, eq, isNull, sql } from "drizzle-orm";

import { CURRENT_PREGEN_BATCH } from "@/lib/pregen-batch";
import { findCompanyByDomain } from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import { leadContactTable, leadDomainTable } from "@/server/db/leads-schema";
import {
  readHubspotCompanyActivityHistory,
  readHubspotCompanyEmailHistory,
} from "@/server/services/hubspot-company-email-context.service";
import { summarizeCorrespondence } from "@/server/services/lead-correspondence";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const batch = arg("batch") ?? CURRENT_PREGEN_BATCH;

const domains = await db
  .select({
    id: leadDomainTable.id,
    domain: leadDomainTable.domain,
    hubspotRecordId: leadDomainTable.hubspotRecordId,
  })
  .from(leadDomainTable)
  .where(
    and(
      eq(leadDomainTable.pregenBatch, batch),
      isNull(leadDomainTable.deletedAt),
    ),
  );

console.log(`${batch}: ${domains.length} domain(s)\n`);

for (const row of domains) {
  const company =
    row.hubspotRecordId != null
      ? { id: row.hubspotRecordId }
      : await findCompanyByDomain(row.domain);
  if (!company) {
    console.log(`skip  ${row.domain}: no linked HubSpot company`);
    continue;
  }

  const [history, activity, contacts] = await Promise.all([
    readHubspotCompanyEmailHistory(company.id, {
      limit: 100,
      maxBodyCharacters: 1_600,
    }),
    readHubspotCompanyActivityHistory(company.id, {
      limit: 40,
      maxBodyCharacters: 1_200,
    }),
    db
      .select({
        email: leadContactTable.email,
        firstName: leadContactTable.firstName,
        lastName: leadContactTable.lastName,
      })
      .from(leadContactTable)
      .where(eq(leadContactTable.domainId, row.id))
      .limit(60),
  ]);

  const correspondence = summarizeCorrespondence({
    hubspotCompanyId: company.id,
    history,
    activity,
    contacts,
  });

  await db
    .update(leadDomainTable)
    .set({
      enrichment: sql`coalesce(${leadDomainTable.enrichment}, '{}'::jsonb) || ${JSON.stringify(
        { correspondence },
      )}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(leadDomainTable.id, row.id));

  console.log(
    `done  ${row.domain}: ${correspondence.emails.items?.length ?? 0} email excerpts, ${correspondence.activity.items?.length ?? 0} activity excerpts`,
  );
}

process.exit(0);
