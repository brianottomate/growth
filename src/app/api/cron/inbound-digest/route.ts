import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { isInboundDigestHour } from "@/lib/inbound-lead-digest";
import { postInboundLeadDigest } from "@/server/services/inbound-router.service";

function isAuthorized(request: NextRequest): boolean {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;
  return bearer === env.ADMIN_TOKEN;
}

/**
 * Daily 5pm Mountain summary of the small inbound leads the router held back
 * from real-time alerts. Scheduled at 23:00 and 00:00 UTC so one of them is
 * 5pm in both MDT and MST; the other returns without touching the database.
 * Both are `:00` marks the hourly crons already wake Neon for.
 * `?force=1` posts outside the hour, for a manual run.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && !isInboundDigestHour(new Date())) {
    return NextResponse.json({ success: true, skipped: "not 5pm Mountain" });
  }
  const result = await postInboundLeadDigest();
  return NextResponse.json({ success: true, ...result });
}
