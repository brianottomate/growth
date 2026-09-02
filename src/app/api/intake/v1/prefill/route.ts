import { NextResponse, type NextRequest } from "next/server";

import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";
import { PerformanceError } from "@/server/services/performance.service";
import { intakePrefill } from "@/server/services/performance-intake.service";

/**
 * What the client-facing intake form needs to render, by connect token.
 *
 * GET /api/intake/v1/prefill?token=...  or  ?slug=...
 *
 * Called by wander.com, which hosts the form. A token is unguessable; a slug
 * is readable and guessable, and returns less as a result (see intakePrefill).
 * Either way the gateway bearer is what proves the caller is our own server
 * rather than the open internet, and the client's browser never holds it.
 *
 * `requireGatewayAuth` is named for the HubSpot gateway it was written for,
 * but the token it checks is the growth gateway's, shared by every
 * wander.com-to-growth call. Reused rather than reimplemented.
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
    return NextResponse.json(await intakePrefill({ token, slug }));
  } catch (error) {
    if (error instanceof PerformanceError) {
      return NextResponse.json({ error: "Unknown link" }, { status: 404 });
    }
    console.error("intake prefill failed", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
