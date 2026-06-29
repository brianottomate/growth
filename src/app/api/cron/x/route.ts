import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { scanScoreAndPersistTweets } from "@/server/services/twitter-monitor.service";

/**
 * X (Twitter) listening scan, every 6 hours. Runs the watchlist recent-search,
 * dedups against stored mentions, AI-scores the fresh ones, drafts replies for
 * the engage-worthy hits, and writes the keepers to `mention` (source="twitter")
 * — surfacing in /app/listen-v2 and #radio-social-listening (Kyle gets @-pinged).
 * Idempotent: dedup is on the unique mention url, so a re-run never double-posts.
 * Runs every 6 hours (schedule in vercel.json).
 *
 * Recent search looks back ~7 days, so a 6-hour cadence never misses a window;
 * the endpoint's 450 req/15min (app-only) limit leaves enormous headroom.
 * Scoring + drafting are a handful of LLM calls per run, well within the 300s
 * function budget.
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

  const start = Date.now();
  try {
    const result = await scanScoreAndPersistTweets();
    const elapsedMs = Date.now() - start;
    console.log(
      `[x-monitor] fetched ${result.fetched}, ${result.fresh} fresh, ` +
        `${result.inserted} new (${result.engage} engage), ` +
        `${result.broadcast} → Slack in ${elapsedMs}ms`,
    );
    return NextResponse.json({ success: true, elapsedMs, ...result });
  } catch (e) {
    console.error("[x-monitor] scan failed", e);
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
