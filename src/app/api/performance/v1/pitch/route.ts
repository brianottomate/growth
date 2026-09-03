import { NextResponse, type NextRequest } from "next/server";

import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";
import { PerformanceError } from "@/server/services/performance.service";
import { performancePitch } from "@/server/services/performance-intake.service";

// Reads the client's own site and their listing search, then resolves their
// messy location fields through a model, so it is far slower than a database
// lookup and worth the wait: the homes are the pitch. Fluid compute bills for
// active CPU rather than wall time, so this takes the time it needs instead of
// being sized to a two-minute ceiling.
export const maxDuration = 800;

/**
 * The sales pitch page's payload. GET /api/performance/v1/pitch
 *
 * Addressed by the brand slug, because a rep reads these links out loud and a
 * token is not readable. The payload is therefore limited to what is already
 * public on the client's own booking site plus our own pitch, and carries no
 * commercial state, contact details or ids.
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
    return NextResponse.json(await performancePitch({ token, slug }));
  } catch (error) {
    if (error instanceof PerformanceError) {
      return NextResponse.json({ error: "Unknown link" }, { status: 404 });
    }
    console.error("performance pitch failed", error);
    return NextResponse.json({ error: "Pitch unavailable" }, { status: 500 });
  }
}
