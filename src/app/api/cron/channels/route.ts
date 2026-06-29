import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { backfillContactChannels } from "@/server/services/channel-discovery.service";

/**
 * Contact-channel discovery backfill. Crawls lead websites to capture every way
 * to reach them (emails, phone, contact form, chatbot) and persists them as
 * `lead_channel` rows + reachability flags on `lead_domain`. Skip-if-fresh:
 * only domains never scraped (or stale past `staleDays`) are candidates, so
 * re-runs are cheap and don't re-burn Firecrawl credits.
 *
 * Idempotent: channels upsert on (domain, kind, value); a re-run refreshes
 * capture fields without touching delivery state. Tunable via query params:
 *   ?limit=100&concurrency=4&staleDays=30
 *
 * Bounded worker-pool concurrency keeps it inside the 300s function budget.
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

function intParam(
  request: NextRequest,
  key: string,
  fallback: number,
): number {
  const raw = request.nextUrl.searchParams.get(key);
  const parsed = raw == null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const start = Date.now();
  try {
    const result = await backfillContactChannels({
      limit: intParam(request, "limit", 100),
      concurrency: intParam(request, "concurrency", 4),
      staleDays: intParam(request, "staleDays", 30),
    });
    const elapsedMs = Date.now() - start;
    console.log(
      `[channel-backfill] ${result.candidateCount} candidates, ` +
        `${result.ok} ok, ${result.failed} failed in ${elapsedMs}ms`,
    );
    return NextResponse.json({ success: true, elapsedMs, ...result });
  } catch (e) {
    console.error("[channel-backfill] failed", e);
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
