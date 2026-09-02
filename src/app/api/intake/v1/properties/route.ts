import { NextResponse, type NextRequest } from "next/server";

import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";
import { PerformanceError } from "@/server/services/performance.service";
import { intakeListings } from "@/server/services/performance-intake.service";

// Reads the client's own site and then their listing search, so it is slower
// than a database lookup and faster than a human pasting 200 URLs.
export const maxDuration = 60;

/**
 * The homes on a client's booking site. GET /api/intake/v1/properties
 *
 * Keyed on the brand's domain, so a WanderOS site just works and anything
 * else comes back as `supported: false` for the form to fall back to manual
 * entry. Never an error: not being a WanderOS site is an ordinary answer.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;

  const params = request.nextUrl.searchParams;
  const token = params.get("token") ?? undefined;
  const slug = params.get("slug") ?? undefined;
  if (!token && !slug) {
    return NextResponse.json({ error: "Missing handle" }, { status: 400 });
  }

  try {
    return NextResponse.json(await intakeListings({ token, slug }));
  } catch (error) {
    if (error instanceof PerformanceError) {
      return NextResponse.json({ error: "Unknown link" }, { status: 404 });
    }
    console.error("intake listings failed", error);
    // The form still works without this, so a failure here is "manual entry"
    // rather than something the client has to see.
    return NextResponse.json({ supported: false, listings: [] });
  }
}
