import { createHmac } from "node:crypto";

import { asc, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { db } from "@/server/db";
import { hubspotWebhookEventTable } from "@/server/db/leads-schema";

export const maxDuration = 60;

const REPLAY_LIMIT = 500;
const REPLAY_BATCH_SIZE = 100;

function isAuthorized(request: NextRequest): boolean {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;
  return bearer === env.ADMIN_TOKEN;
}

function signature(body: string, timestamp: string, secret: string): string {
  const uri = `${env.NEXT_PUBLIC_BASE_URL}/api/webhooks/hubspot`;
  return createHmac("sha256", secret)
    .update(`POST${uri}${body}${timestamp}`)
    .digest("base64");
}

/**
 * Automatic retry rail for accept-then-process webhook delivery.
 *
 * The primary receiver stores every payload before responding and normally
 * projects it in `after()`. If that projection ever fails, this cron replays
 * the authentic stored payload through the same signed receiver. Event-ID
 * dedupe keeps storage idempotent while the projection gets another attempt.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  if (!env.HUBSPOT_WEBHOOK_CLIENT_SECRET) {
    return NextResponse.json(
      { success: false, error: "HubSpot webhook secret is not configured" },
      { status: 503 },
    );
  }

  const pending = await db
    .select({ payload: hubspotWebhookEventTable.payload })
    .from(hubspotWebhookEventTable)
    .where(isNull(hubspotWebhookEventTable.processedAt))
    .orderBy(asc(hubspotWebhookEventTable.createdAt))
    .limit(REPLAY_LIMIT);

  let replayed = 0;
  for (let index = 0; index < pending.length; index += REPLAY_BATCH_SIZE) {
    const body = JSON.stringify(
      pending
        .slice(index, index + REPLAY_BATCH_SIZE)
        .map((event) => event.payload),
    );
    const timestamp = String(Date.now());
    const response = await fetch(
      `${env.NEXT_PUBLIC_BASE_URL}/api/webhooks/hubspot`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hubspot-request-timestamp": timestamp,
          "x-hubspot-signature-v3": signature(
            body,
            timestamp,
            env.HUBSPOT_WEBHOOK_CLIENT_SECRET,
          ),
        },
        body,
      },
    );
    if (!response.ok) {
      throw new Error(
        `HubSpot webhook replay failed with HTTP ${response.status}`,
      );
    }
    replayed += Math.min(REPLAY_BATCH_SIZE, pending.length - index);
  }

  return NextResponse.json({
    success: true,
    pendingFound: pending.length,
    replayed,
    capped: pending.length === REPLAY_LIMIT,
  });
}
