import { NextResponse } from "next/server";

import { env } from "@/env";
import { isHubspotConfigured } from "@/server/clients/hubspot.client";

/**
 * Gateway health — unauthenticated, booleans only (no secrets).
 * GET /api/hubspot/v1/health
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "hubspot-gateway",
    hubspotConfigured: isHubspotConfigured,
    gatewayAuthConfigured: !!env.GROWTH_GATEWAY_API_TOKEN,
    timestamp: new Date().toISOString(),
  });
}
