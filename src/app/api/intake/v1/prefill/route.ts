import { NextResponse, type NextRequest } from "next/server";

import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";
import { PerformanceError } from "@/server/services/performance.service";
import { intakePrefill } from "@/server/services/performance-intake.service";

/**
 * What the client-facing intake form needs to render, by connect token.
 *
 * GET /api/intake/v1/prefill?token=...
 *
 * Called by wander.com, which hosts the form. Two gates on purpose: the
 * gateway bearer proves the caller is our own server rather than the open
 * internet, and the token identifies which brand. Neither is sufficient
 * alone, and the client's browser never holds the bearer.
 *
 * `requireGatewayAuth` is named for the HubSpot gateway it was written for,
 * but the token it checks is the growth gateway's, shared by every
 * wander.com-to-growth call. Reused rather than reimplemented.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;

  const token = request.nextUrl.searchParams.get("token");
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    return NextResponse.json(await intakePrefill(token));
  } catch (error) {
    if (error instanceof PerformanceError) {
      return NextResponse.json({ error: "Unknown link" }, { status: 404 });
    }
    console.error("intake prefill failed", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
