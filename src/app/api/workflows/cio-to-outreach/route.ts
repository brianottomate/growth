import { NextResponse, type NextRequest } from "next/server";
import { handleCioToOutreachWebhook } from "@/server/services/cio-to-outreach-workflow.service";

/**
 * POST /api/workflows/cio-to-outreach
 *
 * Generic Customer.io -> Outreach sync webhook.
 * Supports both legacy payloads ({ event_name, data: { ... } })
 * and new flat payloads ({ event_type, ... }).
 */
export async function POST(request: NextRequest) {
  return handleCioToOutreachWebhook(request, {
    serviceLabel: "CIO to Outreach Workflow",
    defaultEventType: "cio_workflow",
  });
}

/**
 * GET /api/workflows/cio-to-outreach — Health check
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "cio-to-outreach-workflow",
    timestamp: new Date().toISOString(),
  });
}
