import { NextResponse, type NextRequest } from "next/server";
import { handleCioToOutreachWebhook } from "@/server/services/cio-to-outreach-workflow.service";

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
  return handleCioToOutreachWebhook(request, {
    serviceLabel: "CIO Abandoned Cart Workflow",
    defaultEventType: "abandoned_cart",
  });
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
