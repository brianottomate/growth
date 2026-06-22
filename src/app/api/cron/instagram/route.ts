import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { scanAccountWatchSources } from "@/server/services/instagram-watch.service";

/**
 * Daily account-watch scan (Instagram). Walks every active `account_watch`
 * source, pulls each watched account's recent posts via Bright Data, scores them
 * for "should Wander's official account comment?", drafts the comment, and writes
 * the keepers to `mention` (source="instagram") — surfacing in /app/listen-v2 and
 * #radio-social-listening. Idempotent: dedup is on the unique mention url, so a
 * re-run never double-posts. Runs at 0 13 * * * (see vercel.json).
 *
 * The Bright Data IG crawl can take a while per account — Vercel functions allow
 * up to 300s, which covers a small watchlist.
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
    const result = await scanAccountWatchSources();
    const elapsedMs = Date.now() - start;
    console.log(
      `[instagram-watch] ${result.sources} sources / ${result.accounts} accounts · ` +
        `scanned ${result.scanned}, ${result.fresh} fresh, ${result.inserted} new ` +
        `(${result.engage} engage), ${result.broadcast} → Slack in ${elapsedMs}ms`,
    );
    if (result.errors.length) {
      console.warn(`[instagram-watch] errors: ${result.errors.join(" | ")}`);
    }
    return NextResponse.json({ success: true, elapsedMs, ...result });
  } catch (e) {
    console.error("[instagram-watch] scan failed", e);
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
