/**
 * Rollout health for the demand-sales HubSpot sync, read from the two tables
 * the pipeline already writes: `demand_crm_link` (one row per guest, with
 * the last error) and `hubspot_webhook_event` (the `demand__bdr` parity
 * events). No logs required — this is what to look at after merging.
 */
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { demandCrmLinkTable } from "@/server/db/demand-schema";
import { hubspotWebhookEventTable } from "@/server/db/leads-schema";
import { DEMAND_BDR_PROPERTY } from "./owner-parity";

export interface DemandSyncStatus {
  window: { hours: number; since: string };
  link: {
    /** Guests the sync has ever touched. */
    totalContacts: number;
    /** Guests with a HubSpot contact id on file. */
    linkedContacts: number;
    /** Successful HubSpot writes in the window. */
    syncedInWindow: number;
    /** Guests whose most recent attempt failed (any time). */
    currentlyFailing: number;
    /** Failures whose last attempt fell in the window. */
    failedInWindow: number;
    lastSyncedAt: string | null;
    lastErrorAt: string | null;
    /** Most common current failure messages — the thing to fix first. */
    topErrors: { error: string; count: number; sampleEmail: string }[];
  };
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

  const [totals] = await db
    .select({
      totalContacts: sql<number>`count(*)::int`,
      linkedContacts: sql<number>`count(${demandCrmLinkTable.hubspotContactId})::int`,
      currentlyFailing: sql<number>`count(*) filter (where ${demandCrmLinkTable.lastError} is not null)::int`,
      syncedInWindow: sql<number>`count(*) filter (where ${demandCrmLinkTable.lastSyncedAt} >= ${since})::int`,
      failedInWindow: sql<number>`count(*) filter (where ${demandCrmLinkTable.lastError} is not null and ${demandCrmLinkTable.updatedAt} >= ${since})::int`,
      lastSyncedAt: sql<string | null>`max(${demandCrmLinkTable.lastSyncedAt})`,
      lastErrorAt: sql<
        string | null
      >`max(${demandCrmLinkTable.updatedAt}) filter (where ${demandCrmLinkTable.lastError} is not null)`,
    })
    .from(demandCrmLinkTable);

  const topErrors = await db
    .select({
      error: demandCrmLinkTable.lastError,
      count: sql<number>`count(*)::int`,
      sampleEmail: sql<string>`min(${demandCrmLinkTable.email})`,
    })
    .from(demandCrmLinkTable)
    .where(isNotNull(demandCrmLinkTable.lastError))
    .groupBy(demandCrmLinkTable.lastError)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

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
    link: {
      totalContacts: totals?.totalContacts ?? 0,
      linkedContacts: totals?.linkedContacts ?? 0,
      syncedInWindow: totals?.syncedInWindow ?? 0,
      currentlyFailing: totals?.currentlyFailing ?? 0,
      failedInWindow: totals?.failedInWindow ?? 0,
      lastSyncedAt: totals?.lastSyncedAt
        ? new Date(totals.lastSyncedAt).toISOString()
        : null,
      lastErrorAt: totals?.lastErrorAt
        ? new Date(totals.lastErrorAt).toISOString()
        : null,
      topErrors: topErrors.map((row) => ({
        error: row.error ?? "",
        count: row.count,
        sampleEmail: row.sampleEmail,
      })),
    },
    parity: {
      eventsInWindow: parityTotals?.eventsInWindow ?? 0,
      pending: parityTotals?.pending ?? 0,
      outcomes: outcomes.map((row) => ({ note: row.note, count: row.count })),
    },
  };
}
