import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { db } from "@/server/db";

export const maxDuration = 300;

const CHUNK = 20_000;
/** Stop starting new chunks after this; the rest goes next month. */
const BUDGET_MS = 240_000;

function isAuthorized(request: NextRequest): boolean {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;
  return bearer === env.ADMIN_TOKEN;
}

/**
 * Monthly purge of raw HubSpot webhook events older than 30 days, pending
 * ones included. The projections they fed live on in leads.*; the raw rows
 * were most of the database. Runs at 03:00 on the 1st, a mark the daily
 * sync already wakes the database for.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const started = Date.now();
  let deleted = 0;
  while (Date.now() - started < BUDGET_MS) {
    const result = await db.execute(sql`
      DELETE FROM leads.hubspot_webhook_event
      WHERE id IN (
        SELECT id FROM leads.hubspot_webhook_event
        WHERE created_at < now() - interval '30 days'
        LIMIT ${CHUNK}
      )`);
    const count = result.rowCount ?? 0;
    deleted += count;
    if (count < CHUNK) break;
  }
  return NextResponse.json({
    success: true,
    hubspotWebhookEventsDeleted: deleted,
  });
}
