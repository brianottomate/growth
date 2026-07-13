import "server-only";

import { sql } from "drizzle-orm";

import { fetchEmailsByUserIds } from "@/server/clients/bigquery.client";
import { db } from "@/server/db";
import { funnelStateTable } from "@/server/db/funnel-schema";

// =====================================================
// Funnel heal — BigQuery as the trust rail
//
// Phase 1 scope: email backfill. Search Started carries no email
// event-property, so search-only users land in funnel_state with
// email NULL and the sweep can't act on them. BigQuery's
// analytics.customer_profiles has the email for every known user id —
// heal it across so the sweep's emailable pool covers everyone.
//
// The full heal (event backfill + funnel_drift_log + purchase truth
// from analytics.bookings) is follow-up scope.
// =====================================================

export interface EmailBackfillResult {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  missingEmail: number;
  lookedUp: number;
  healed: number;
  prunedState: number;
  prunedSendLog: number;
}

export async function runFunnelEmailBackfill(options: {
  limit?: number;
}): Promise<EmailBackfillResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 2000, 10000));
  const startedAt = new Date();

  const missing = await db
    .select({ userId: funnelStateTable.userId })
    .from(funnelStateTable)
    .where(sql`${funnelStateTable.email} IS NULL`)
    .limit(limit);

  let healed = 0;
  let lookedUp = 0;

  if (missing.length > 0) {
    const found = await fetchEmailsByUserIds(missing.map((m) => m.userId));
    lookedUp = found.length;

    if (found.length > 0) {
      // One statement instead of N round-trips over the HTTP driver. Pairs
      // travel as a single jsonb param — drizzle binds a JS array as a row
      // constructor ($1, $2), not a PG array, so unnest(...::text[]) breaks.
      const pairs = JSON.stringify(
        found.map((f) => ({ u: f.id_user, m: f.email })),
      );
      const result = await db.execute(sql`
        UPDATE ${funnelStateTable} AS fs
        SET email = v.email
        FROM (
          SELECT e->>'u' AS user_id, e->>'m' AS email
          FROM jsonb_array_elements(${pairs}::jsonb) e
        ) v
        WHERE fs.user_id = v.user_id AND fs.email IS NULL
      `);
      healed = result.rowCount ?? found.length;
    }
  }

  // Rolling retention (design doc §ops): storage is a non-issue (state is
  // one row per user), this is PII hygiene — a user inactive for 90 days
  // has no business sitting in an internal DB. Returning users are simply
  // re-created by their next event and re-healed. Send-log history beyond
  // 90 days lives on in Outreach itself.
  const prunedStateRes = await db.execute(sql`
    DELETE FROM ${funnelStateTable} WHERE updated_at < now() - interval '90 days'
  `);
  const prunedLogRes = await db.execute(sql`
    DELETE FROM funnel_send_log WHERE sent_at < now() - interval '90 days'
  `);
  const prunedState = prunedStateRes.rowCount ?? 0;
  const prunedSendLog = prunedLogRes.rowCount ?? 0;

  console.log(
    `🩹 [FunnelHeal] Email backfill: missing=${missing.length} lookedUp=${lookedUp} healed=${healed} | pruned state=${prunedState} sendLog=${prunedSendLog}`,
  );

  const completedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    missingEmail: missing.length,
    lookedUp,
    healed,
    prunedState,
    prunedSendLog,
  };
}
