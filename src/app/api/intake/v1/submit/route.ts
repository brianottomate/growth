import { after, NextResponse, type NextRequest } from "next/server";

import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";
import { PerformanceError } from "@/server/services/performance.service";
import { notifyPerformanceIntakeSubmission } from "@/server/services/performance-intake-notification.service";
import {
  submitIntakeSchema,
  submitPerformanceIntake,
} from "@/server/services/performance-intake.service";

/**
 * Record a Performance intake. POST /api/intake/v1/submit
 *
 * Called by wander.com, which hosts the form. The body's token or slug
 * resolves the brand, so this route must never accept an accountId or
 * brandId from the caller. The gateway bearer is what stops the open internet
 * from filing submissions directly.
 */
export async function POST(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;

  const parsed = submitIntakeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const { intakeId } = await submitPerformanceIntake(parsed.data);
    after(() => notifyPerformanceIntakeSubmission(intakeId));
    return NextResponse.json({ ok: true, intakeId });
  } catch (error) {
    if (error instanceof PerformanceError) {
      return NextResponse.json({ error: "Unknown link" }, { status: 404 });
    }
    console.error("intake submission failed", error);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
