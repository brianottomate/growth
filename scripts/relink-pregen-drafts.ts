/**
 * Repoint existing pregen drafts at the wander.com wrapper.
 *
 * Touch 1 is rendered as `opening \n\n LINK \n\n closing`, and the link line is
 * mechanical — the model never writes it and is forbidden from referring to it.
 * So a draft can be moved onto the new link by rewriting that one paragraph,
 * which is strictly better than regenerating: regeneration re-rolls copy that
 * has already been read, costs an LLM call per domain, and would re-derive the
 * motion from cohort membership that has not changed.
 *
 * Only touches drafts. Approved and queued rows are already on a HubSpot
 * contact, where the property is the record of what was published.
 *
 *   bun run scripts/relink-pregen-drafts.ts                 # dry run
 *   bun run scripts/relink-pregen-drafts.ts --apply
 *   bun run scripts/relink-pregen-drafts.ts --batch pregen-2 --apply
 */
import { and, eq, isNull } from "drizzle-orm";

import { outreachLinkFor } from "@/lib/pregen-urls";
import { db } from "@/server/db";
import { leadDomainTable, leadSequenceTable } from "@/server/db/leads-schema";

const apply = process.argv.includes("--apply");
const batchIndex = process.argv.indexOf("--batch");
const batch = batchIndex > -1 ? process.argv[batchIndex + 1] : undefined;

const LINK_LINE = /^https?:\/\/\S+$/;

async function main() {
  const rows = await db
    .select({
      id: leadSequenceTable.id,
      domain: leadSequenceTable.domain,
      steps: leadSequenceTable.steps,
      pregenSiteUrl: leadDomainTable.pregenSiteUrl,
    })
    .from(leadSequenceTable)
    .innerJoin(
      leadDomainTable,
      eq(leadDomainTable.id, leadSequenceTable.domainId),
    )
    .where(
      and(
        eq(leadSequenceTable.status, "draft"),
        isNull(leadDomainTable.deletedAt),
        ...(batch ? [eq(leadDomainTable.pregenBatch, batch)] : []),
      ),
    );

  let changed = 0;
  let skipped = 0;

  for (const row of rows) {
    const steps = row.steps ?? [];
    const touch1 = steps[0];
    if (!touch1 || !row.pregenSiteUrl) {
      console.log(`skip  ${row.domain}: no touch 1 or no preview assigned`);
      skipped += 1;
      continue;
    }

    const parts = touch1.body.split(/\n{2,}/).map((part) => part.trim());
    const linkIndex = parts.findIndex((part) => LINK_LINE.test(part));
    if (linkIndex < 1 || linkIndex === parts.length - 1) {
      console.log(`skip  ${row.domain}: touch 1 has no standalone link line`);
      skipped += 1;
      continue;
    }

    const next = outreachLinkFor(row.pregenSiteUrl, row.domain);
    if (parts[linkIndex] === next) {
      console.log(`ok    ${row.domain}: already on the wrapper`);
      skipped += 1;
      continue;
    }

    parts[linkIndex] = next;
    const nextSteps = steps.map((step, index) =>
      index === 0 ? { ...step, body: parts.join("\n\n") } : step,
    );

    console.log(`relink ${row.domain}`);
    console.log(`   from ${touch1.body.split(/\n{2,}/)[linkIndex]?.trim()}`);
    console.log(`   to   ${next}`);
    changed += 1;

    if (apply) {
      await db
        .update(leadSequenceTable)
        .set({ steps: nextSteps, updatedAt: new Date() })
        .where(eq(leadSequenceTable.id, row.id));
    }
  }

  console.log(
    `\n${apply ? "updated" : "would update"} ${changed} draft(s), skipped ${skipped}, of ${rows.length} considered`,
  );
  if (!apply && changed > 0) console.log("Re-run with --apply to write.");
}

await main();
process.exit(0);
