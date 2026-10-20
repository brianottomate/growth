import { NextResponse, type NextRequest } from "next/server";
import { metaOAuthGrantSchema } from "@/lib/meta-oauth-session";
import { getBrandByConnectToken } from "@/server/services/brand-connect.service";
import {
  metaOAuthSession,
  saveMetaOAuthSession,
  clearMetaOAuthSession,
} from "@/server/services/meta-oauth-cookie";
import { listPendingMetaPages } from "@/server/clients/zernio.client";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const session = await metaOAuthSession(token);
  const query = request.nextUrl.searchParams;
  const brand = await getBrandByConnectToken(token);
  let ok = false;
  try {
    if (
      !brand ||
      session?.phase !== "start" ||
      query.get("state") !== session.state ||
      query.has("error") ||
      query.get("profileId") !== brand.zernioProfileId ||
      query.get("step") !== "select_page"
    )
      throw new Error("Invalid OAuth return");
    const userProfile: unknown = JSON.parse(
      decodeURIComponent(query.get("userProfile") ?? ""),
    );
    const grant = metaOAuthGrantSchema.parse({
      phase: "grant",
      profileId: brand.zernioProfileId,
      tempToken: query.get("tempToken"),
      connectToken: query.get("connect_token"),
      userProfile,
      returnTo: session.returnTo,
    });
    // The provider validates this new token and its profile-bound headless credential.
    await listPendingMetaPages(grant);
    await saveMetaOAuthSession(token, grant);
    ok = true;
  } catch {
    await clearMetaOAuthSession(token);
  }
  return NextResponse.redirect(
    new URL(`/connect/${token}/meta${ok ? "" : "?error=1"}`, request.url),
    {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
