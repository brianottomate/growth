import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import {
  BRAND_CONNECT_CHANNELS,
  startBrandConnect,
  type BrandConnectChannelKey,
} from "@/server/services/brand-connect.service";

export const dynamic = "force-dynamic";

/**
 * Mints the OAuth URL for one channel and 302s the client to the platform's
 * consent screen. Minted per click because authUrls expire; the share link
 * that got the client here does not.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; channel: string }> },
) {
  const { token, channel } = await context.params;
  if (!BRAND_CONNECT_CHANNELS.some((row) => row.key === channel)) {
    return NextResponse.json({ error: "Unknown channel" }, { status: 404 });
  }

  let authUrl: string;
  try {
    authUrl = await startBrandConnect(token, channel as BrandConnectChannelKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Zernio says this account already exists — treat the click as a success
    // and let the page's sync pick it up.
    if (message === "already_connected") {
      redirect(`/connect/${token}?connected=${channel}`);
    }
    if (message === "Unknown connect link") {
      return NextResponse.json({ error: "Unknown link" }, { status: 404 });
    }
    console.error("brand connect start failed", error);
    return NextResponse.json(
      { error: "Could not start the connection. Try again in a minute." },
      { status: 502 },
    );
  }
  redirect(authUrl);
}
