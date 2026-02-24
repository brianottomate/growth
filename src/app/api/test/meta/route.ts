import { NextResponse } from "next/server";
import { env } from "@/env";
import { fetchMetaConversions } from "@/server/clients/meta.client";

/**
 * Meta Ads diagnostic endpoint — READ ONLY, never writes to BigQuery.
 * Requires Authorization: Bearer <ADMIN_TOKEN>
 *
 * GET /api/test/meta                        — config check + fetch yesterday's data (dry run)
 * GET /api/test/meta?mode=config            — config check only (no API call)
 * GET /api/test/meta?startDate=2024-01-01&endDate=2024-01-03  — custom date range
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (bearer !== env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  // -----------------------------------------------
  // Config check — no API call
  // -----------------------------------------------
  const hasToken = !!(env.FB_SYSUSER_TOKEN ?? env.META_ACCESS_TOKEN);
  const tokenSource = env.FB_SYSUSER_TOKEN
    ? "FB_SYSUSER_TOKEN"
    : env.META_ACCESS_TOKEN
      ? "META_ACCESS_TOKEN"
      : null;
  const tokenPreview = env.FB_SYSUSER_TOKEN
    ? `${env.FB_SYSUSER_TOKEN.slice(0, 10)}...`
    : env.META_ACCESS_TOKEN
      ? `${env.META_ACCESS_TOKEN.slice(0, 10)}...`
      : null;

  const config = {
    hasToken,
    tokenSource,
    tokenPreview,
    adAccountId: env.META_AD_ACCOUNT_ID ?? null,
    adAccountIdValid:
      env.META_AD_ACCOUNT_ID?.startsWith("act_") ?? false,
  };

  if (mode === "config") {
    return NextResponse.json({
      success: hasToken && !!env.META_AD_ACCOUNT_ID,
      config,
      usage: {
        config: "/api/test/meta?mode=config — config check only",
        fetch: "/api/test/meta — fetch yesterday's data (dry run)",
        custom:
          "/api/test/meta?startDate=2024-01-01&endDate=2024-01-03 — custom range",
      },
    });
  }

  if (!hasToken) {
    return NextResponse.json(
      {
        success: false,
        error: "FB_SYSUSER_TOKEN or META_ACCESS_TOKEN is not set",
        config,
      },
      { status: 500 },
    );
  }

  if (!env.META_AD_ACCOUNT_ID) {
    return NextResponse.json(
      {
        success: false,
        error: "META_AD_ACCOUNT_ID is not set",
        config,
      },
      { status: 500 },
    );
  }

  // -----------------------------------------------
  // Fetch data — read only, no BigQuery write
  // -----------------------------------------------
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const defaultDate = yesterday.toISOString().slice(0, 10);

  const resolvedStart = startDate ?? defaultDate;
  const resolvedEnd = endDate ?? defaultDate;

  const startMs = Date.now();
  console.log(`[test/meta] Fetching ${resolvedStart} → ${resolvedEnd}`);

  try {
    const rows = await fetchMetaConversions({
      startDate: resolvedStart,
      endDate: resolvedEnd,
    });

    const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
    const totalPurchases = rows.reduce(
      (s, r) => s + r.purchases_1d_view_28d_click,
      0,
    );
    const totalRevenue = rows.reduce(
      (s, r) => s + r.purchase_value_1d_view_28d_click,
      0,
    );
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    console.log(
      `[test/meta] Done — ${rows.length} rows, spend=$${totalSpend.toFixed(0)}, ROAS=${roas.toFixed(2)}, duration=${Date.now() - startMs}ms`,
    );

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - startMs,
      query: { startDate: resolvedStart, endDate: resolvedEnd },
      summary: {
        rowCount: rows.length,
        totalSpend: Math.round(totalSpend * 100) / 100,
        totalPurchases: Math.round(totalPurchases),
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        roas: Math.round(roas * 100) / 100,
      },
      // First 3 rows as sample — enough to verify field mapping
      sample: rows.slice(0, 3),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[test/meta] Error: ${message}`);
    return NextResponse.json(
      {
        success: false,
        durationMs: Date.now() - startMs,
        query: { startDate: resolvedStart, endDate: resolvedEnd },
        error: message,
      },
      { status: 500 },
    );
  }
}
