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
      const userIds = found.map((f) => f.id_user);
      const emails = found.map((f) => f.email);
      // One statement instead of N round-trips over the HTTP driver.
      const result = await db.execute(sql`
        UPDATE ${funnelStateTable} AS fs
        SET email = v.email
        FROM (
          SELECT unnest(${userIds}::text[]) AS user_id,
                 unnest(${emails}::text[]) AS email
        ) v
        WHERE fs.user_id = v.user_id AND fs.email IS NULL
      `);
      healed = result.rowCount ?? found.length;
    }
  }

  console.log(
    `🩹 [FunnelHeal] Email backfill: missing=${missing.length} lookedUp=${lookedUp} healed=${healed}`,
  );

  const completedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    missingEmail: missing.length,
    lookedUp,
    healed,
  };
}
