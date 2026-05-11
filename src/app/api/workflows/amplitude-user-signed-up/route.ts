import { NextResponse, type NextRequest } from "next/server";
import { handleCioToOutreachWebhook } from "@/server/services/cio-to-outreach-workflow.service";

// =====================================================
// POST /api/workflows/amplitude-user-signed-up
//
// Called by Amplitude's Webhook destination (real-time)
// on User Signed Up events. Bypasses the Segment → CIO
// hop so we don't lose ~50% of signups before they reach
// Outreach.
//
// Expected payload (configured in Amplitude destination):
// {
//   "event_name": "user_signed_up",
//   "timestamp": "{{event.event_time}}",
//   "data": {
//     "email": "{{user.email}}",
//     "customer_id": "{{user.user_id}}"
//   }
// }
//
// Auth: reuses CUSTOMERIO_WEBHOOK_BEARER_TOKEN.
// =====================================================

export async function POST(request: NextRequest) {
  return handleCioToOutreachWebhook(request, {
    serviceLabel: "Amplitude User Signed Up",
    defaultEventType: "user_signed_up",
  });
}

// =====================================================
// GET /api/workflows/amplitude-user-signed-up — Health check
// =====================================================

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "amplitude-user-signed-up",
    timestamp: new Date().toISOString(),
  });
}
