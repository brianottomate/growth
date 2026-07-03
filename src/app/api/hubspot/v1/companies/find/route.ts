import { NextResponse, type NextRequest } from "next/server";

import {
  findCompanyByDomain,
  isHubspotConfigured,
} from "@/server/clients/hubspot.client";
import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";

/**
 * Find a company by exact domain (read-only).
 * GET /api/hubspot/v1/companies/find?domain=example.com
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;
  if (!isHubspotConfigured) {
    return NextResponse.json(
      { success: false, error: "HubSpot is not configured" },
      { status: 503 },
    );
  }

  const domain = request.nextUrl.searchParams
    .get("domain")
    ?.trim()
    .toLowerCase();
  if (!domain) {
    return NextResponse.json(
      { success: false, error: "Missing ?domain= query param" },
      { status: 400 },
    );
  }

  try {
    const company = await findCompanyByDomain(domain);
    return NextResponse.json({ success: true, found: !!company, company });
  } catch (err) {
    console.error("❌ [hubspot-gateway] companies/find", err);
    return NextResponse.json(
      { success: false, error: "HubSpot request failed" },
      { status: 502 },
    );
  }
}
