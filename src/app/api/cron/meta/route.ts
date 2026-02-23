import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { runMetaDailySync } from "@/server/services/meta-sync.service";

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

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function parseNumber(
  value: string | null,
  fallback: number,
  bounds?: { min?: number; max?: number },
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  const min = bounds?.min ?? Number.NEGATIVE_INFINITY;
  const max = bounds?.max ?? Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, parsed));
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const daysBack = parseNumber(
    request.nextUrl.searchParams.get("daysBack"),
    3,
    { min: 1, max: 90 },
  );
  const dryRun = parseBoolean(
    request.nextUrl.searchParams.get("dryRun"),
    false,
  );

  try {
    const result = await runMetaDailySync({ daysBack, dryRun });

    return NextResponse.json({
      success: true,
      options: { daysBack, dryRun },
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/meta] Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const job = request.nextUrl.searchParams.get("job");

  // Health check — no auth required
  if (!job && request.nextUrl.searchParams.size === 0) {
    return NextResponse.json({
      status: "ok",
      service: "meta-cron",
      schedule: "0 6 * * * (daily 6 AM UTC)",
      usage: "GET /api/cron/meta?daysBack=3&dryRun=false",
      auth: "Authorization: Bearer <ADMIN_TOKEN> or Vercel CRON_SECRET",
    });
  }

  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
