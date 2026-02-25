/**
 * Outreach → Customer.io sync webhook
 *
 * Receives prospect.updated events from Outreach and syncs:
 * - Owner (BDR) changes → CIO assigned_bdr_email / _name / _outreach_id
 * - Stage changes       → CIO outreach_stage_id / outreach_stage_name
 *
 * Only human-initiated owner changes (actor.type === "User") are synced
 * to prevent circular writes when our own CIO→Outreach pipeline sets ownership.
 *
 * Register this webhook in Outreach:
 *   POST https://api.outreach.io/api/v2/webhooks
 *   { data: { type: "webhook", attributes: {
 *       url: "<NEXT_PUBLIC_BASE_URL>/api/webhooks/outreach-to-cio",
 *       resource: "prospect",
 *       action: "updated",
 *       secret: "<OUTREACH_WEBHOOK_SECRET>",
 *       payloadVersion: 2
 *   }}}
 */

import { type NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/env";
import { processOutreachProspectUpdate } from "@/server/services/outreach-to-cio-workflow.service";

// =====================================================
// TYPES
// =====================================================

interface RelationshipRef {
  // Standard JSON:API format: { data: { id, type } }
  data?: { id?: string | number; type?: string } | null;
  // Outreach webhook format (flat, no data wrapper): { id, type }
  id?: string | number;
  type?: string;
}

interface OutreachProspectDelta {
  type?: string;
  id?: string | number;
  attributes?: Record<string, unknown>;
  relationships?: {
    owner?: RelationshipRef;
    stage?: RelationshipRef;
    [key: string]: RelationshipRef | undefined;
  };
}

interface OutreachProspectWebhookPayload {
  data?: OutreachProspectDelta;
  beforeUpdate?: OutreachProspectDelta;
  meta?: {
    deliveredAt?: string;
    eventName?: string;
    actor?: { id?: number; type?: string } | null;
  };
}

// =====================================================
// SIGNATURE VERIFICATION
// =====================================================

function verifyOutreachSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;

  const hmac = createHmac("sha256", secret);
  hmac.update(rawBody);
  const expectedHex = hmac.digest("hex");

  // Outreach sends hex; handle both hex and base64 defensively
  const actual = signature.trim().replace(/^sha256=/i, "");
  const looksHex = /^[0-9a-f]+$/i.test(actual);
  const expected = looksHex
    ? expectedHex
    : Buffer.from(expectedHex, "hex").toString("base64");

  if (actual.length !== expected.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(actual, "utf8"),
      Buffer.from(expected, "utf8"),
    );
  } catch {
    return false;
  }
}

// =====================================================
// PAYLOAD HELPERS
// =====================================================

function parsePayload(raw: string): OutreachProspectWebhookPayload {
  try {
    return JSON.parse(raw) as OutreachProspectWebhookPayload;
  } catch {
    return {};
  }
}

function getRelId(rel?: RelationshipRef): string | null {
  // Outreach webhook payloads use a flat { id, type } rather than
  // the standard JSON:API { data: { id, type } } wrapper.
  if (rel?.id != null) return String(rel.id);
  if (rel?.data?.id != null) return String(rel.data.id);
  return null;
}

// =====================================================
// HANDLER
// =====================================================

const HANDLED_EVENTS = new Set(["prospect.updated"]);

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // ── Signature verification ────────────────────────────────────────────────
    if (
      env.OUTREACH_WEBHOOK_SECRET &&
      !env.OUTREACH_DISABLE_WEBHOOK_SIGNATURE_CHECK
    ) {
      const signature = request.headers.get("outreach-webhook-signature");
      const valid = verifyOutreachSignature(
        rawBody,
        signature,
        env.OUTREACH_WEBHOOK_SECRET,
      );

      if (!valid) {
        console.error("❌ [Outreach→CIO] Invalid signature", {
          hasHeader: Boolean(signature),
          sigPrefix: signature?.slice(0, 12) ?? null,
          bodyLength: rawBody.length,
        });
        return NextResponse.json(
          { success: false, error: "Invalid signature" },
          { status: 401 },
        );
      }
    }

    // ── Parse ─────────────────────────────────────────────────────────────────
    const payload = parsePayload(rawBody);
    const eventName = payload.meta?.eventName ?? "unknown";
    const prospectId = payload.data?.id;
    const actorType = payload.meta?.actor?.type ?? null;

    if (!HANDLED_EVENTS.has(eventName)) {
      return NextResponse.json({ success: true, skipped: true, eventName });
    }

    // ── Extract change signals ────────────────────────────────────────────────
    const newOwnerId = getRelId(payload.data?.relationships?.owner);
    const oldOwnerId = getRelId(payload.beforeUpdate?.relationships?.owner);
    const newStageId = getRelId(payload.data?.relationships?.stage);
    const oldStageId = getRelId(payload.beforeUpdate?.relationships?.stage);

    const ownerChanged = newOwnerId !== null && newOwnerId !== oldOwnerId;
    const stageChanged = newStageId !== null && newStageId !== oldStageId;

    if (!ownerChanged && !stageChanged) {
      return NextResponse.json({ success: true, skipped: true, reason: "no_relevant_changes" });
    }

    console.log(
      `📨 [Outreach→CIO] ${eventName} | prospect=${prospectId ?? "?"} | actor=${actorType ?? "null"} | ${ownerChanged ? `owner:${oldOwnerId}→${newOwnerId}` : ""}${stageChanged ? ` stage:${oldStageId}→${newStageId}` : ""}`,
    );

    if (env.SYNC_DEBUG) {
      console.log(`🔍 [Outreach→CIO] payload:`, JSON.stringify(payload, null, 2).slice(0, 2000));
    }

    if (!prospectId) {
      return NextResponse.json({ success: true, skipped: true, reason: "no_prospect_id" });
    }

    const result = await processOutreachProspectUpdate({
      prospectId,
      newOwnerId,
      oldOwnerId,
      newStageId,
      oldStageId,
      actorType,
    });

    return NextResponse.json({
      success: true,
      eventName,
      status: result.status,
      reason: result.reason ?? null,
      email: result.email ?? null,
      bdrSynced: result.bdrSynced ?? false,
      stageSynced: result.stageSynced ?? false,
      processingTimeMs: result.processingTimeMs,
    });
  } catch (error) {
    console.error("❌ [Outreach→CIO] Error processing webhook:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// =====================================================
// HEALTH CHECK
// =====================================================

export async function GET() {
  const webhookUrl = `${env.NEXT_PUBLIC_BASE_URL}/api/webhooks/outreach-to-cio`;
  return NextResponse.json({
    success: true,
    message: "Outreach → CIO sync webhook endpoint ready",
    webhookUrl,
    signatureVerificationEnabled:
      Boolean(env.OUTREACH_WEBHOOK_SECRET) &&
      !env.OUTREACH_DISABLE_WEBHOOK_SIGNATURE_CHECK,
    handledEvents: Array.from(HANDLED_EVENTS),
    syncedChanges: ["owner (human-initiated)", "stage"],
  });
}
