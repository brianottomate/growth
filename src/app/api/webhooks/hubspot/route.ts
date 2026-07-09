import { NextResponse, after, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import {
  hubspotWebhookEventTable,
  leadDomainTable,
  type HubspotWebhookEventInsert,
} from "@/server/db/leads-schema";

// HubSpot webhook receiver (private app "Operated", account 22480390).
//
// Accept-then-process: every event row is stored raw in
// leads.hubspot_webhook_event BEFORE anything is applied, so a processing bug
// can never lose an event, and HubSpot redeliveries dedupe on eventId. A
// light inline pass (via after()) refreshes lead_domain status/owner for
// companies the link pass already matched; everything else stays pending for
// the projection processor that lands with the full company backfill.
// See docs/leads-convergence-plan.md — sync design.

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000; // HubSpot rejects replays > 5 min

// propertyChange events we apply inline: HubSpot property -> lead_domain column
const INLINE_COMPANY_PROPS = {
  hs_lead_status: "hubspotLeadStatus",
  hubspot_owner_id: "hubspotOwner",
} as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

/**
 * HubSpot v3 signature: base64(HMAC-SHA256(method + uri + body + timestamp))
 * signed with the private app's client secret. The uri must match the target
 * URL configured in HubSpot exactly — we reconstruct it from
 * NEXT_PUBLIC_BASE_URL rather than trusting proxy headers.
 */
function verifyV3Signature(params: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
}): { valid: boolean; reason?: string } {
  const { rawBody, signature, timestamp, secret } = params;
  if (!signature) return { valid: false, reason: "missing signature header" };
  if (!timestamp) return { valid: false, reason: "missing timestamp header" };

  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age > MAX_TIMESTAMP_SKEW_MS) {
    return { valid: false, reason: "timestamp too old" };
  }

  const uri = `${env.NEXT_PUBLIC_BASE_URL}/api/webhooks/hubspot`;
  const expected = createHmac("sha256", secret)
    .update(`POST${uri}${rawBody}${timestamp}`)
    .digest("base64");

  const actual = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actual.length !== expectedBuf.length) {
    return { valid: false, reason: "signature mismatch" };
  }
  try {
    return timingSafeEqual(actual, expectedBuf)
      ? { valid: true }
      : { valid: false, reason: "signature mismatch" };
  } catch {
    return { valid: false, reason: "signature comparison failed" };
  }
}

function parseEvents(rawBody: string): HubspotWebhookEventInsert[] {
  const parsed: unknown = JSON.parse(rawBody);
  if (!Array.isArray(parsed)) return [];

  const rows: HubspotWebhookEventInsert[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    const eventId = asString(item.eventId);
    const subscriptionType = asString(item.subscriptionType);
    // Merge events carry primaryObjectId instead of objectId.
    const objectId = asString(item.objectId) ?? asString(item.primaryObjectId);
    if (!eventId || !subscriptionType || !objectId) continue;

    const occurredAtMs = Number(item.occurredAt);
    rows.push({
      eventId,
      subscriptionType,
      objectId,
      portalId: asString(item.portalId),
      propertyName: asString(item.propertyName),
      propertyValue: asString(item.propertyValue),
      changeSource: asString(item.changeSource),
      attemptNumber:
        typeof item.attemptNumber === "number" ? item.attemptNumber : 0,
      occurredAt: Number.isFinite(occurredAtMs)
        ? new Date(occurredAtMs)
        : null,
      payload: item,
    });
  }
  return rows;
}

/**
 * Inline application for the columns the app already reads. Companies the
 * link pass matched carry hubspotRecordId on lead_domain; anything unmatched
 * stays pending for the backfill processor.
 */
async function applyInline(rows: HubspotWebhookEventInsert[]) {
  for (const row of rows) {
    if (row.subscriptionType !== "company.propertyChange") continue;
    const column =
      INLINE_COMPANY_PROPS[
        row.propertyName as keyof typeof INLINE_COMPANY_PROPS
      ];
    if (!column) continue;

    try {
      const updated = await db
        .update(leadDomainTable)
        .set({ [column]: row.propertyValue })
        .where(eq(leadDomainTable.hubspotRecordId, row.objectId))
        .returning({ id: leadDomainTable.id });

      if (updated.length > 0) {
        await db
          .update(hubspotWebhookEventTable)
          .set({
            processedAt: new Date(),
            processNote: `inline: ${column} on ${updated.length} lead_domain row(s)`,
          })
          .where(eq(hubspotWebhookEventTable.eventId, row.eventId));
      }
    } catch (error) {
      console.error(
        `❌ [HubSpot Webhook] inline apply failed (eventId=${row.eventId})`,
        error,
      );
    }
  }
}

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { success: false, error: "Unreadable body" },
      { status: 400 },
    );
  }

  if (env.HUBSPOT_WEBHOOK_CLIENT_SECRET) {
    const result = verifyV3Signature({
      rawBody,
      signature: request.headers.get("x-hubspot-signature-v3"),
      timestamp: request.headers.get("x-hubspot-request-timestamp"),
      secret: env.HUBSPOT_WEBHOOK_CLIENT_SECRET,
    });
    if (!result.valid) {
      console.error(`❌ [HubSpot Webhook] rejected: ${result.reason}`);
      return NextResponse.json(
        { success: false, error: "Invalid signature" },
        { status: 401 },
      );
    }
  } else {
    console.warn(
      "⚠️ [HubSpot Webhook] HUBSPOT_WEBHOOK_CLIENT_SECRET not set — accepting unverified events",
    );
  }

  let rows: HubspotWebhookEventInsert[];
  try {
    rows = parseEvents(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  // Store raw first — this is the durability contract. Redeliveries no-op on
  // the eventId unique index.
  if (rows.length > 0) {
    await db
      .insert(hubspotWebhookEventTable)
      .values(rows)
      .onConflictDoNothing({ target: hubspotWebhookEventTable.eventId });
  }

  // Respond fast; apply the light pass after the response is sent.
  after(() => applyInline(rows));

  return NextResponse.json({ success: true, received: rows.length });
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "HubSpot webhook endpoint ready",
    webhookUrl: `${env.NEXT_PUBLIC_BASE_URL}/api/webhooks/hubspot`,
    signatureVerificationEnabled: Boolean(env.HUBSPOT_WEBHOOK_CLIENT_SECRET),
  });
}
