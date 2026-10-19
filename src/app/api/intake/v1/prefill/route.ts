import { NextResponse, type NextRequest } from "next/server";

import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";
import { PerformanceError } from "@/server/services/performance.service";
import { intakePrefill } from "@/server/services/performance-intake.service";

/** Token-only onboarding prefill, called server-side by wander.com. */
export async function GET(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;

  const params = request.nextUrl.searchParams;
  const token = params.get("token");
  if (!token) {
    return NextResponse.json(
      { error: "Missing onboarding token" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await intakePrefill({ token }));
  } catch (error) {
    if (error instanceof PerformanceError) {
      return NextResponse.json({ error: "Unknown link" }, { status: 404 });
    }
    console.error("intake prefill failed", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
