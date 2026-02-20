import { NextResponse, type NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { timingSafeEqual } from "crypto";
import { env } from "@/env";
import { processLead } from "@/server/services/sync.service";

// =====================================================
// AUTH HELPERS
// =====================================================

function extractBearerToken(authorizationHeader: string | null): string {
  if (!authorizationHeader) return "";
  const trimmed = authorizationHeader.trim();
  const prefix = "Bearer ";
  if (!trimmed.startsWith(prefix)) return "";
  return trimmed.slice(prefix.length).trim();
}

function safeTokenEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

// =====================================================
// POST /api/workflows/cio-abandoned-cart
//
// Called by CIO workflow HTTP Request actions.
// CIO handles all branching/delays — this endpoint just
// receives qualified leads and syncs them to Outreach.
//
// Expected payload (Liquid-templated in CIO):
// {
//   "email": "{{customer.email}}",
//   "event_type": "abandoned_cart",       // or whatever context you set
//   "workflow_step": "hot_lead_booker",   // optional: which branch fired
//   "first_name": "{{customer.first_name}}",
//   "last_name": "{{customer.last_name}}",
//   "phone": "{{customer.phone}}",
//   "property_name": "{{event.property_name}}",
//   ... any other attributes you template in CIO
// }
// =====================================================

export async function POST(request: NextRequest) {
  const startMs = Date.now();

  try {
    // 1. Verify bearer token
    const configuredToken = env.CUSTOMERIO_WEBHOOK_BEARER_TOKEN;
    if (!configuredToken) {
      console.error("❌ [CIO Workflow] CUSTOMERIO_WEBHOOK_BEARER_TOKEN not configured");
      return NextResponse.json(
        { error: "Webhook auth is not configured" },
        { status: 500 },
      );
    }

    const presentedToken = extractBearerToken(
      request.headers.get("authorization"),
    );
    if (!safeTokenEquals(presentedToken, configuredToken)) {
      console.error("❌ [CIO Workflow] Invalid bearer token");
      return NextResponse.json(
        { error: "Invalid bearer token" },
        { status: 401 },
      );
    }

    // 2. Parse payload
    const payload = (await request.json()) as Record<string, unknown>;

    const email = payload.email as string | undefined;
    if (!email) {
      console.warn(
        "⚠️ [CIO Workflow] No email in payload:",
        JSON.stringify(payload).slice(0, 500),
      );
      return NextResponse.json(
        { success: true, skipped: true, reason: "no_email" },
        { status: 200 },
      );
    }

    const eventType =
      (payload.event_type as string) ??
      (payload.workflow_step as string) ??
      "abandoned_cart";

    console.log(
      `📨 [CIO Workflow] Received: ${eventType} for ${email} (step: ${(payload.workflow_step as string) ?? "unknown"}, ${Date.now() - startMs}ms)`,
    );

    // 3. Return 200 immediately, process in background
    waitUntil(
      processLead({
        email,
        eventType,
        eventData: payload,
      })
        .then((result) => {
          console.log(
            `📋 [CIO Workflow] Sync result: ${result.status} — ${result.outreachAction ?? "no action"} (${result.processingTimeMs}ms)`,
          );
        })
        .catch((error) => {
          console.error(
            "❌ [CIO Workflow] Background processing error:",
            error,
          );
        }),
    );

    return NextResponse.json({
      success: true,
      email,
      eventType,
      message: "Processing in background",
    });
  } catch (error) {
    console.error("❌ [CIO Workflow] Error:", error);
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
// GET /api/workflows/cio-abandoned-cart — Health check
// =====================================================

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "cio-abandoned-cart-workflow",
    timestamp: new Date().toISOString(),
  });
}
