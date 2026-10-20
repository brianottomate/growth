import { NextResponse, type NextRequest } from "next/server";
import {
  getBrandByConnectToken,
  ensureBrandZernioProfile,
} from "@/server/services/brand-connect.service";
import { newConnectionToken } from "@/server/services/connection-token";
import { getZernioConnectUrl } from "@/server/clients/zernio.client";
import { saveMetaOAuthSession } from "@/server/services/meta-oauth-cookie";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const brand = await getBrandByConnectToken(token);
  if (!brand)
    return NextResponse.json({ error: "Unknown link" }, { status: 404 });
  const returnTo =
    request.nextUrl.searchParams.get("returnTo") === "intake"
      ? "intake"
      : "connect";
  const state = newConnectionToken();
  try {
    const profileId = await ensureBrandZernioProfile(brand);
    const redirectUrl = new URL(`/connect/${token}/meta/callback`, request.url);
    redirectUrl.searchParams.set("state", state);
    const authUrl = await getZernioConnectUrl({
      target: { kind: "ads", platform: "facebook" },
      profileId,
      redirectUrl: redirectUrl.toString(),
      headless: true,
      force: true,
    });
    await saveMetaOAuthSession(token, { phase: "start", state, returnTo });
    return NextResponse.redirect(authUrl, {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return NextResponse.redirect(
      new URL(`/connect/${token}/meta?error=1`, request.url),
      {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
}
