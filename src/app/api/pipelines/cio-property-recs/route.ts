import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { run } from "@/server/pipelines/cio-property-recs/cio-property-recs.pipeline";

/**
 * POST /api/pipelines/cio-property-recs
 *
 * Manual trigger for the CIO property recs pipeline.
 * Requires Authorization: Bearer <ADMIN_TOKEN>.
 *
 * Body (all optional):
 *   { dryRun?: boolean, limit?: number, testEmails?: string[] }
 *
 * Examples:
 *   curl -X POST .../api/pipelines/cio-property-recs \
 *     -H "Authorization: Bearer $ADMIN_TOKEN" \
 *     -d '{"dryRun": true, "limit": 100}'
 *
 *   curl -X POST .../api/pipelines/cio-property-recs \
 *     -H "Authorization: Bearer $ADMIN_TOKEN" \
 *     -d '{"dryRun": true, "testEmails": ["you@wander.com"]}'
 */
export async function POST(request: NextRequest) {
  const token =
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    request.nextUrl.searchParams.get("token");

  if (token !== env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { dryRun?: boolean; limit?: number; testEmails?: string[] } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dryRun = body.dryRun ?? true; // default to dry run for safety
  const limit = body.limit;
  const testEmails = body.testEmails;

  console.log(
    `[cio-property-recs] triggered — dryRun=${dryRun} limit=${limit ?? "none"} emails=${testEmails?.join(",") ?? "all"}`,
  );

  try {
    const result = await run({ dryRun, limit, testEmails });
    return NextResponse.json({ success: true, options: { dryRun, limit, testEmails }, result });
  } catch (err) {
    console.error("[cio-property-recs] pipeline error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const token =
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    request.nextUrl.searchParams.get("token");

  if (token !== env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "ok",
    pipeline: "cio-property-recs",
    usage: {
      method: "POST",
      auth: "Authorization: Bearer <ADMIN_TOKEN>",
      body: { dryRun: "boolean (default: true)", limit: "number (optional)", testEmails: "string[] (optional)" },
    },
  });
}
