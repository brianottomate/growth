import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import {
  FUNNEL_EVENTS,
  ingestFunnelEvent,
} from "@/server/services/funnel-ingest.service";
import {
  extractBearerToken,
  safeTokenEquals,
} from "@/server/utils/webhook-auth";

// =====================================================
// POST /api/workflows/amplitude-funnel-event
//
// Called by the Amplitude Webhook destination (cloned from the
// "User Signed Up" destination) for the marketplace funnel events:
// Search Started, Product Added To Wishlist, Checkout Previewed,
// Checkout Started, Payment Info Entered, Payment Submit Clicked,
// Order Completed.
//
// Purely dark: upserts funnel_state (one row per user) and returns.
// Nothing is sent to Outreach/CIO from here — detection and sends live
// in the sweep job (Phase 1, docs/funnel-abandonment.md).
//
// Expected payload (configured per-destination in Amplitude):
// {
//   "event_name": "search_started",
//   "timestamp": "{{event.event_time}}",
//   "user_id": "{{user.user_id}}",
//   "email": "{{user.email}}",
//   "properties": {
//     "destination": "{{event.destination}}",
//     "checkin_date": "{{event.checkin_date}}",
//     "checkout_date": "{{event.checkout_date}}",
//     "search_flexible": "{{event.search_flexible}}",
//     "search_trigger": "{{event.search_trigger}}",
//     "search_parent_id": "{{event.search_parent_id}}",
//     "property_name": "{{event.name}}",
//     "value": "{{event.value}}"
//   }
// }
//
// Auth: reuses CUSTOMERIO_WEBHOOK_BEARER_TOKEN, same as the sibling
// workflow routes.
// =====================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!safeTokenEquals(token, env.CUSTOMERIO_WEBHOOK_BEARER_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payload = isRecord(rawPayload) ? rawPayload : {};

  const eventNameRaw =
    typeof payload.event_name === "string" ? payload.event_name : "";
  if (!eventNameRaw) {
    return NextResponse.json({ error: "Missing event_name" }, { status: 400 });
  }

  const result = await ingestFunnelEvent({
    eventName: eventNameRaw,
    timestamp:
      typeof payload.timestamp === "string" ||
      typeof payload.timestamp === "number"
        ? payload.timestamp
        : null,
    userId: typeof payload.user_id === "string" ? payload.user_id : null,
    email: typeof payload.email === "string" ? payload.email : null,
    properties: isRecord(payload.properties) ? payload.properties : {},
  });

  if (result.status === "applied" || result.status === "skipped_stale") {
    console.log(
      `[Funnel Ingest] ${result.eventName}: ${result.status}`,
      typeof payload.user_id === "string" ? payload.user_id : "(no user)",
    );
  } else {
    console.warn(`[Funnel Ingest] ${eventNameRaw}: ${result.status}`);
  }

  // Always 200 for processable requests — a non-2xx makes Amplitude retry,
  // which is only correct for auth/transport problems, not for events we
  // deliberately ignore or can't attribute.
  return NextResponse.json({ success: true, ...result });
}

// =====================================================
// GET /api/workflows/amplitude-funnel-event — Health check
// =====================================================

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "amplitude-funnel-event",
    events: [...FUNNEL_EVENTS],
    timestamp: new Date().toISOString(),
  });
}
