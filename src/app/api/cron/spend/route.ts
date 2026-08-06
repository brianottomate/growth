import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import {
  getSpendTracker,
  resolveSpendWindow,
  SPEND_TRACKER_CACHE_TAG,
} from "@/server/services/spend-tracker/spend-tracker.service";

// Spend Tracker cache warmer — daily via vercel.json (05:30 UTC, before the
// 06:00 Meta sync). Revalidates the cache tag, then recomputes the two windows
// the dashboard defaults to (MTD + 90d) so the first human load is instant.

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  // Vercel injects CRON_SECRET automatically for cron invocations
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;

  // Fallback: ADMIN_TOKEN for manual invocation
  return bearer === env.ADMIN_TOKEN;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    revalidateTag(SPEND_TRACKER_CACHE_TAG, "max");

    // Warm the default windows (explicit dates → stable cache keys per day).
    const now = new Date();
    const mtdStart = `${now.toISOString().slice(0, 7)}-01`;
    const mtd = resolveSpendWindow({ start: mtdStart });
    const ninety = resolveSpendWindow({ days: 90 });

    const [mtdResult, ninetyResult] = await Promise.all([
      getSpendTracker(mtd.startDate, mtd.endDate),
      getSpendTracker(ninety.startDate, ninety.endDate),
    ]);

    return NextResponse.json({
      success: true,
      warmed: [
        {
          window: mtd,
          spend: mtdResult.summary.totals.totalMarketingSpend,
          dataHealth: mtdResult.summary.dataHealth.status,
        },
        {
          window: ninety,
          spend: ninetyResult.summary.totals.totalMarketingSpend,
          dataHealth: ninetyResult.summary.dataHealth.status,
        },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/spend] Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  // Health check ONLY for unauthenticated browser hits — a Vercel cron
  // invocation always carries an Authorization header and must run the job.
  // (The meta cron's `searchParams.size === 0` health check made the cron a
  // silent no-op; don't repeat that here.)
  if (
    !request.headers.get("authorization") &&
    request.nextUrl.searchParams.size === 0
  ) {
    return NextResponse.json({
      status: "ok",
      service: "spend-cron",
      schedule: "30 5 * * * (daily 5:30 AM UTC)",
      usage:
        "GET /api/cron/spend  (Authorization: Bearer <ADMIN_TOKEN> or Vercel CRON_SECRET)",
    });
  }

  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
