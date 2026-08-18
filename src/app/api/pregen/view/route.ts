import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";

import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";
import { recordPregenPreviewView } from "@/server/services/pregen/preview-view.service";

/**
 * Pageview beacon for the wander.com/os pitch pages. Called by wander.com's
 * /api/os/preview-view with the same gateway bearer as the inbound lead
 * forward. Accept-then-process: the beacon is fire-and-forget from a
 * visitor's browser, so nothing here is worth making it wait for.
 *
 * POST /api/pregen/view  { websiteId, test? }
 */

const body = z.object({
  websiteId: z.string().trim().min(1).max(64),
  test: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { websiteId, test } = parsed.data;
  after(async () => {
    try {
      const result = await recordPregenPreviewView({ websiteId, test });
      console.log("[pregen/view]", websiteId, JSON.stringify(result));
    } catch (error) {
      console.error("[pregen/view] failed", websiteId, error);
    }
  });

  return NextResponse.json({ success: true });
}
