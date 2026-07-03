import { NextResponse, type NextRequest } from "next/server";

import {
  isHubspotConfigured,
  upsertCompany,
} from "@/server/clients/hubspot.client";
import {
  requireGatewayAuth,
  upsertCompanyBody,
} from "@/server/services/hubspot-gateway.service";

/**
 * Audit-always company upsert keyed by domain — only backfills fields that
 * are currently empty in HubSpot, never overwrites sales-set values.
 * POST /api/hubspot/v1/companies/upsert  { domain, properties? }
 */
export async function POST(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;
  if (!isHubspotConfigured) {
    return NextResponse.json(
      { success: false, error: "HubSpot is not configured" },
      { status: 503 },
    );
  }

  const parsed = upsertCompanyBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await upsertCompany(
      parsed.data.domain,
      parsed.data.properties,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("❌ [hubspot-gateway] companies/upsert", err);
    return NextResponse.json(
      { success: false, error: "HubSpot request failed" },
      { status: 502 },
    );
  }
}
