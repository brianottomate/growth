import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { isMetaLeadgenConfigured } from "@/server/clients/meta-leadgen.client";
import { pollRecentLeads } from "@/server/services/meta-leadgen.service";

/**
 * Retry rail for the Meta leadgen webhook, hourly on :00 (a mark other crons
 * already wake Neon for). Re-reads every active lead form's recent leads, then
 * drains unfinished ledger rows up to 7 days old; each step is claimed once per
 * leadgen id.
 * `?hoursBack=` widens the window for a backfill, capped at Meta's 7-day
 * CAPI event window.
 */
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;
  return bearer === env.ADMIN_TOKEN;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isMetaLeadgenConfigured) {
    return NextResponse.json(
      { error: "META_LEADS_ACCESS_TOKEN is not configured" },
      { status: 503 },
    );
  }
  const requested = Number(request.nextUrl.searchParams.get("hoursBack") ?? 3);
  const hoursBack = Math.min(Math.max(requested || 3, 1), 168);
  const summary = await pollRecentLeads({ hoursBack });
  console.log("[meta-leadgen] poll", { hoursBack, ...summary });
  return NextResponse.json({ success: true, hoursBack, ...summary });
}
