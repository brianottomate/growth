/**
 * Rollout health for the demand-sales `demand__bdr` parity webhook, read from
 * `hubspot_webhook_event` (the raw event log). Per-lead sync success/failure
 * is not tracked in a table — it is on the `[DemandSync]` log line — so this
 * covers only the webhook path.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { hubspotWebhookEventTable } from "@/server/db/leads-schema";
import { DEMAND_BDR_PROPERTY } from "./owner-parity";

export interface DemandSyncStatus {
  window: { hours: number; since: string };
  parity: {
    /** `demand__bdr` webhook events received in the window. */
    eventsInWindow: number;
    /** Still unprocessed — the hourly retry rail will replay them. */
    pending: number;
    /** How each processed event was classified (mirrored vs. dropped and why). */
    outcomes: { note: string; count: number }[];
  };
}

export async function getDemandSyncStatus(
  hoursBack = 24,
): Promise<DemandSyncStatus> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const parityWhere = and(
    eq(hubspotWebhookEventTable.propertyName, DEMAND_BDR_PROPERTY),
    gte(hubspotWebhookEventTable.createdAt, since),
  );
  const [parityTotals] = await db
    .select({
      eventsInWindow: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${hubspotWebhookEventTable.processedAt} is null)::int`,
    })
    .from(hubspotWebhookEventTable)
    .where(parityWhere);

  // Group on the note with its per-event tail stripped ("(stacy@…)", "(999)")
  // so like outcomes collapse into one row.
  const outcomeKey = sql<string>`coalesce(regexp_replace(${hubspotWebhookEventTable.processNote}, '\\s*\\(.*\\)$', ''), 'pending')`;
  const outcomes = await db
    .select({
      note: outcomeKey,
      count: sql<number>`count(*)::int`,
    })
    .from(hubspotWebhookEventTable)
    .where(parityWhere)
    .groupBy(outcomeKey)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return {
    window: { hours: hoursBack, since: since.toISOString() },
    parity: {
      eventsInWindow: parityTotals?.eventsInWindow ?? 0,
      pending: parityTotals?.pending ?? 0,
      outcomes: outcomes.map((row) => ({ note: row.note, count: row.count })),
    },
  };
}
