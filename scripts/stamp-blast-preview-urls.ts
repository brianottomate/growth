/**
 * Stamp `growth_pregen_preview_url` onto HubSpot contacts for the blast arm.
 *
 * The one-size-fits-all blast is authored in HubSpot by a human; the only
 * thing its template needs from Growth is a merge field per contact holding
 * that company's preview link. This writes exactly that property and nothing
 * else — no copy, no enrolment, no sends.
 *
 * The link carries `utm_campaign=pregen_blast`, distinct from the bespoke
 * sequences' `pregen_sites`, so once both arms run, clicks and replies
 * separate by arm and blast-vs-bespoke is a measurement. Note that a later
 * bespoke publish overwrites the property with its own link, which is correct:
 * a contact should only ever be in one arm.
 *
 * Contact choice per domain is the same scorer the leads UI ranks with,
 * including the stored correspondence signal, filtered to contacts that can
 * actually be reached (HubSpot-linked, not a placeholder mailbox).
 *
 *   bun --conditions=react-server scripts/stamp-blast-preview-urls.ts                  # dry run
 *   bun --conditions=react-server scripts/stamp-blast-preview-urls.ts --apply
 *   bun --conditions=react-server scripts/stamp-blast-preview-urls.ts --batch pregen-2 --apply
 */
import { and, eq, isNull, isNotNull } from "drizzle-orm";

import { CURRENT_PREGEN_BATCH } from "@/lib/pregen-batch";
import { outreachLinkFor } from "@/lib/pregen-urls";
import { updateContact } from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import { leadContactTable, leadDomainTable } from "@/server/db/leads-schema";
import { storedContactMentions } from "@/server/services/lead-correspondence";
import {
  isPlaceholderEmail,
  scoreStoredContact,
} from "@/server/services/lead-channel.service";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const apply = process.argv.includes("--apply");
const batch = arg("batch") ?? CURRENT_PREGEN_BATCH;

const domains = await db
  .select({
    id: leadDomainTable.id,
    domain: leadDomainTable.domain,
    pregenSiteUrl: leadDomainTable.pregenSiteUrl,
    enrichment: leadDomainTable.enrichment,
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

console.log(`${batch}: ${domains.length} domain(s) with previews\n`);

let stamped = 0;
let skipped = 0;

for (const row of domains) {
  if (row.excludeFromOutreach) {
    console.log(`skip  ${row.domain}: excluded from outreach`);
    skipped += 1;
    continue;
  }

  const contacts = await db
    .select({
      id: leadContactTable.id,
      email: leadContactTable.email,
      firstName: leadContactTable.firstName,
      lastName: leadContactTable.lastName,
      jobTitle: leadContactTable.jobTitle,
      hubspotContactId: leadContactTable.hubspotContactId,
      verificationStatus: leadContactTable.verificationStatus,
      verification: leadContactTable.verification,
    })
    .from(leadContactTable)
    .where(
      and(
        eq(leadContactTable.domainId, row.id),
        isNull(leadContactTable.deletedAt),
      ),
    );

  const mentions = storedContactMentions(row.enrichment);
  // EVERY reachable contact, not just the top-ranked one. The humans running
  // the blast choose who to enrol inside HubSpot, and a contact they pick that
  // we did not stamp renders the template's unsendable fallback. The link is
  // identical for everyone at the company, so over-stamping costs nothing.
  const reachable = contacts
    .filter(
      (contact) =>
        contact.hubspotContactId != null && !isPlaceholderEmail(contact.email),
    )
    .map((contact) => ({
      contact,
      score: scoreStoredContact(contact, row.domain, {
        historyMentions: mentions?.get(contact.email.toLowerCase()),
      }).score,
    }))
    .sort((left, right) => right.score - left.score);

  if (!reachable.length) {
    console.log(`skip  ${row.domain}: no HubSpot-linked contact to stamp`);
    skipped += 1;
    continue;
  }

  const link = outreachLinkFor(row.pregenSiteUrl!, row.domain, {
    campaign: "pregen_blast",
  });
  console.log(`stamp ${row.domain}`);
  console.log(`      ${link}`);
  for (const { contact, score } of reachable) {
    console.log(`      → ${contact.email} (score ${score})`);
    if (apply) {
      await updateContact(contact.hubspotContactId!, {
        growth_pregen_preview_url: link,
      });
    }
    stamped += 1;
  }
}

console.log(
  `\n${apply ? "stamped" : "would stamp"} ${stamped}, skipped ${skipped}. ${
    apply ? "" : "Re-run with --apply to write."
  }`,
);
process.exit(0);
