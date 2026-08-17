/**
 * Run the trust layer (Minerva geo + opportunistic LinkedIn) across a pregen
 * batch, before anyone is enrolled in a sequence.
 *
 * Same rules as the leads.verifyContacts mutation, batched: freemail contacts
 * only, because a corporate address is already tied to the company by its
 * domain while chefeddy80@gmail.com is tied to nothing. Skips contacts that
 * already carry a verification blob, so re-runs only fill gaps.
 *
 *   bun --conditions=react-server scripts/verify-pregen-contacts.ts
 *   bun --conditions=react-server scripts/verify-pregen-contacts.ts --batch pregen-2
 */
import { and, eq, isNull } from "drizzle-orm";

import { CURRENT_PREGEN_BATCH } from "@/lib/pregen-batch";
import { isMinervaConfigured } from "@/server/clients/minerva.client";
import { db } from "@/server/db";
import { leadContactTable, leadDomainTable } from "@/server/db/leads-schema";
import { isFreemailEmail } from "@/server/services/lead-channel.service";
import { verifyContactPerson } from "@/server/services/lead-verify.service";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (!isMinervaConfigured) throw new Error("MINERVA_API_KEY not set");

const batch = arg("batch") ?? CURRENT_PREGEN_BATCH;

const domains = await db
  .select()
  .from(leadDomainTable)
  .where(
    and(
      eq(leadDomainTable.pregenBatch, batch),
      isNull(leadDomainTable.deletedAt),
    ),
  );

console.log(`${batch}: ${domains.length} domain(s)\n`);

let attempted = 0;
let written = 0;

for (const row of domains) {
  const contacts = await db
    .select()
    .from(leadContactTable)
    .where(
      and(
        eq(leadContactTable.domainId, row.id),
        isNull(leadContactTable.deletedAt),
      ),
    );

  const toVerify = contacts.filter(
    (contact) =>
      isFreemailEmail(contact.email) &&
      contact.verification == null &&
      !contact.email.endsWith("@fake-email.com"),
  );
  if (!toVerify.length) continue;

  console.log(`${row.domain}`);
  for (const contact of toVerify) {
    attempted += 1;
    const verification = await verifyContactPerson({
      email: contact.email,
      company: {
        name: row.companyName,
        domain: row.domain,
        city: row.city,
        state: row.state,
        country: row.country,
      },
    });
    if (!verification) {
      console.log(`  ${contact.email}: Minerva returned nothing`);
      continue;
    }
    await db
      .update(leadContactTable)
      .set({ verification })
      .where(eq(leadContactTable.id, contact.id));
    written += 1;
    const geo =
      verification.geoMatch === "match"
        ? `geo MATCH`
        : verification.geoMatch === "mismatch"
          ? `geo MISMATCH (${verification.minerva?.city ?? verification.minerva?.state ?? "?"})`
          : "geo unknown";
    const company =
      verification.companyMatch === "unknown"
        ? ""
        : ` · employer ${verification.companyMatch}${
            verification.linkedin?.currentCompany
              ? ` (${verification.linkedin.currentCompany})`
              : ""
          }`;
    console.log(`  ${contact.email}: ${geo}${company}`);
  }
}

console.log(`\nattempted ${attempted}, wrote ${written} verification blobs`);
process.exit(0);
