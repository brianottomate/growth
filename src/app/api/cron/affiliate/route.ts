import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { runDailyAffiliateMonitor } from "@/server/services/affiliate-monitor.service";
import { runWeeklyAffiliateReport } from "@/server/services/affiliate-report.service";

/**
 * Affiliate program crons (docs/affiliate-program-takeover.md), multiplexed by
 * ?job= like /api/cron/growth:
 *   job=daily (default) — metrics snapshot, partner sync, application queue,
 *     tracking-health, open disputes (ActionInquiries), overdue payout invoices.
 *   job=weekly — LLM-written program report + per-action fraud review → Slack.
 * Idempotent: metrics upsert per (program, day); items dedup on their keys.
 *
 * Skips cleanly (200 + skipped reason) until IMPACT_* credentials and the
 * program's externalProgramId are set — safe to schedule before Phase 0 lands.
 */
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;
  return bearer === env.ADMIN_TOKEN;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const job = request.nextUrl.searchParams.get("job") ?? "daily";
  const start = Date.now();
  try {
    const results =
      job === "weekly"
        ? await runWeeklyAffiliateReport()
        : await runDailyAffiliateMonitor();
    const elapsedMs = Date.now() - start;
    console.log(`[affiliate-${job}] done in ${elapsedMs}ms:`, results);
    return NextResponse.json({ success: true, job, elapsedMs, results });
  } catch (e) {
    console.error("[affiliate-monitor] run failed", e);
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
