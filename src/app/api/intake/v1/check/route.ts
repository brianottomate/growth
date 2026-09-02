import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";
import { PerformanceError } from "@/server/services/performance.service";
import { checkAccessByToken } from "@/server/services/performance-intake.service";

const schema = z.object({ token: z.string().min(16) });

/**
 * Has the client's Leadsie grant reached us yet? POST /api/intake/v1/check
 *
 * Reassurance for the client mid-form, and it records nothing about
 * verification: the fact we act on is stamped only by an operator session.
 * Still throttled per brand in the service even behind the gateway bearer,
 * because each call reaches Zernio and then Meta.
 */
export async function POST(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    return NextResponse.json(await checkAccessByToken(parsed.data.token));
  } catch (error) {
    if (error instanceof PerformanceError) {
      return NextResponse.json({ error: "Unknown link" }, { status: 404 });
    }
    console.error("intake access check failed", error);
    // Our upstream being unreachable must not block the client's form.
    return NextResponse.json({
      found: false,
      pageName: null,
      throttled: false,
    });
  }
}
