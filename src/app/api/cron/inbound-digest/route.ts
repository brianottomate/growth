import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { isInboundDigestHour } from "@/lib/inbound-lead-digest";
import { postInboundLeadDigest } from "@/server/services/inbound-router.service";
import { postPerformanceLeadDigest } from "@/server/services/performance-lead.service";

function isAuthorized(request: NextRequest): boolean {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;
  return bearer === env.ADMIN_TOKEN;
}

/**
 * Daily 5pm Mountain summaries of the small leads the live alerts held back:
 * WanderOS inbound leads to #radio-core-inbound and Performance beta
 * applications to #radio-performance. Scheduled at 23:00 and 00:00 UTC so one
 * of them is 5pm in both MDT and MST; the other returns without touching the
 * database. Both are `:00` marks the hourly crons already wake Neon for.
 * `?force=1` posts outside the hour, for a manual run.
 *
 * The two digests are independent: a failure in one is reported without
 * costing the other its post for the day.
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
  const [inbound, performance] = await Promise.allSettled([
    postInboundLeadDigest(),
    postPerformanceLeadDigest(),
  ]);
  const digests = {
    inbound: settled("inbound", inbound),
    performance: settled("performance", performance),
  };
  const failed = Object.values(digests).some((digest) => "error" in digest);
  return NextResponse.json(
    { success: !failed, ...digests },
    { status: failed ? 500 : 200 },
  );
}

function settled(
  name: string,
  result: PromiseSettledResult<{ posted: number }>,
): { posted: number } | { error: string } {
  if (result.status === "fulfilled") return result.value;
  console.error(`[inbound-digest] ${name} digest failed`, result.reason);
  return {
    error:
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
  };
}
