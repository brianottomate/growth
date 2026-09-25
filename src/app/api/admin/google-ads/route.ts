import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { googleAdsClient } from "@/server/clients/google-ads.client";
import { GoogleAdsRequestError } from "@/server/clients/google-ads.transport";

export const dynamic = "force-dynamic";

/** Fixed read-only probe of the configured MCC; accepts no account IDs or GAQL. */
export async function GET(request: NextRequest) {
  const expected = env.ADMIN_TOKEN
    ? Buffer.from(`Bearer ${env.ADMIN_TOKEN}`)
    : null;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const headers = { "Cache-Control": "no-store" };
  if (
    !expected ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );

  if (!googleAdsClient.authMode || !env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
    return NextResponse.json({ configured: false }, { status: 503, headers });

  try {
    const rows = await googleAdsClient.search<{
      customer: {
        id: string;
        descriptiveName: string;
        manager: boolean;
        status: string;
      };
    }>(
      env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      "SELECT customer.id, customer.descriptive_name, customer.manager, customer.status FROM customer LIMIT 1",
    );
    const customer = rows[0]?.customer;
    if (!customer?.manager || customer.status !== "ENABLED")
      return NextResponse.json(
        {
          configured: true,
          error: "Configured account is not an enabled manager",
        },
        { status: 502, headers },
      );
    return NextResponse.json(
      { configured: true, authMode: googleAdsClient.authMode, customer },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        error: "Google Ads access check failed",
        ...(error instanceof GoogleAdsRequestError
          ? { upstreamStatus: error.status, requestId: error.requestId }
          : {}),
      },
      { status: 502, headers },
    );
  }
}
