import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { isMetaLeadgenConfigured } from "@/server/clients/meta-leadgen.client";
import { drainMeetingLookups } from "@/server/services/meta-leadgen.service";

// A pass is one ledger query when nothing is waiting, otherwise a Graph read,
// a normalization call, a RevenueHero lookup and a router run per lead.
// drainMeetingLookups stops starting leads well before this.
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;
  return bearer === env.ADMIN_TOKEN;
}

/**
 * Meeting-link Meta leads wait a few minutes after the submit for their
 * RevenueHero booking before routing. The webhook can't wait, so this pass
 * re-asks for every lead still unrouted and routes it: to the rep holding the
 * meeting, or to the round robin once the wait window has passed.
 *
 * Scheduled on marks other crons already wake Neon for (the business-hours
 * sweep's `*\/20` and the hourly `:00`), so it adds no compute windows.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  if (!isMetaLeadgenConfigured) {
    return NextResponse.json(
      { success: false, error: "Meta leadgen is not configured" },
      { status: 503 },
    );
  }
  const summary = await drainMeetingLookups();
  if (summary.found > 0) console.log("[meta-leadgen] meeting drain", summary);
  return NextResponse.json({ success: true, ...summary });
}
