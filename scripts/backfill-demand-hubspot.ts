/**
 * One-off backfill: re-run demand-sales leads that reached Outreach but NOT
 * HubSpot, after the HubSpot demand pipeline stopped at 2026-09-15T15:28:05Z.
 *
 * HubSpot-only (Outreach is unconfigured in this env, so processLead writes
 * only the HubSpot contact). Idempotent — the sink searches by email and
 * updates, so re-running never duplicates. BDR parity is preserved because
 * Outreach already wrote each lead's assigned rep to Customer.io, and
 * processLead's precedence reads that.
 *
 *   bun run scripts/backfill-demand-hubspot.ts [limit]
 *
 * Reads funnel_send_log only; never mutates it.
 */
import { and, asc, eq, gt, isNotNull } from "drizzle-orm";

import { db } from "@/server/db";
import { funnelSendLogTable } from "@/server/db/funnel-schema";
import { processLead } from "@/server/services/sync.service";

const ANCHOR = new Date("2026-09-15T15:28:05Z");
const CONCURRENCY = 4;
const limitArg = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;

const rows = await db
  .select({
    email: funnelSendLogTable.email,
    stage: funnelSendLogTable.stage,
    sentAt: funnelSendLogTable.sentAt,
  })
  .from(funnelSendLogTable)
  .where(
    and(
      eq(funnelSendLogTable.syncStatus, "synced"),
      gt(funnelSendLogTable.sentAt, ANCHOR),
      isNotNull(funnelSendLogTable.email),
    ),
  )
  .orderBy(asc(funnelSendLogTable.sentAt))
  .limit(limitArg ?? 100000);

console.log(
  `Backfill candidates since ${ANCHOR.toISOString()}: ${rows.length}${limitArg ? ` (limited to ${limitArg})` : ""}\n`,
);

interface Res {
  email: string;
  stage: string;
  status: string;
  hubspotAction?: string;
  contactId?: string;
  bdr?: string;
  error?: string;
}
const results: Res[] = [];
let idx = 0;

async function worker() {
  while (idx < rows.length) {
    const i = idx++;
    const r = rows[i]!;
    try {
      const res = await processLead({ email: r.email, eventType: r.stage });
      results.push({
        email: r.email,
        stage: r.stage,
        status: res.status,
        hubspotAction: res.hubspotAction,
        contactId: res.hubspotContactId,
        bdr: res.assignedBdr?.email,
        error: res.hubspotError,
      });
    } catch (e) {
      results.push({
        email: r.email,
        stage: r.stage,
        status: "throw",
        error: e instanceof Error ? e.message : String(e),
      });
    }
    if ((i + 1) % 25 === 0) console.log(`  …processed ${i + 1}/${rows.length}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const created = results.filter((r) => r.hubspotAction === "created").length;
const updated = results.filter((r) => r.hubspotAction === "updated").length;
const skipped = results.filter((r) => r.status === "skipped").length;
const failed = results.filter((r) => r.status === "throw" || r.error);

console.log(`\n=== BACKFILL SUMMARY ===`);
console.log(`processed:        ${results.length}`);
console.log(`hubspot created:  ${created}`);
console.log(`hubspot updated:  ${updated}`);
console.log(`skipped:          ${skipped}`);
console.log(`failed:           ${failed.length}`);

// A few concrete successes to spot-check in HubSpot.
const ok = results.filter((r) => r.hubspotAction).slice(0, 8);
if (ok.length) {
  console.log(`\nsample writes (spot-check these in HubSpot):`);
  for (const r of ok)
    console.log(
      `  ${r.hubspotAction} #${r.contactId} | ${r.email} | ${r.stage} | bdr=${r.bdr ?? "-"}`,
    );
}
if (failed.length) {
  const byMsg = new Map<string, number>();
  for (const f of failed) {
    const key = (f.error ?? "unknown").slice(0, 140);
    byMsg.set(key, (byMsg.get(key) ?? 0) + 1);
  }
  console.log(`\nfailure reasons (most common first):`);
  for (const [msg, n] of [...byMsg.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  [${n}] ${msg}`);
}

process.exit(0);
