import { NextResponse } from "next/server";
import { getOAuthAuthorizationUrl, isOAuthConfigured } from "@/server/clients/outreach.client";
import { env } from "@/env";

/**
 * OAuth Authorization Endpoint
 *
 * GET /api/outreach/oauth/authorize
 *
 * Redirects user to Outreach OAuth consent screen.
 * After authorization, Outreach redirects back to /api/outreach/oauth/callback
 */
export async function GET() {
  if (!isOAuthConfigured) {
    return NextResponse.json(
      {
        success: false,
        error: "OAuth not configured",
        message: "Set OUTREACH_OAUTH_CLIENT_ID and OUTREACH_OAUTH_CLIENT_SECRET",
      },
      { status: 500 },
    );
  }

  try {
    const baseUrl = env.NEXT_PUBLIC_BASE_URL;
    const redirectUri = `${baseUrl}/api/outreach/oauth/callback`;

    // Generate authorization URL
    const authUrl = getOAuthAuthorizationUrl({
      redirectUri,
      state: "oauth-flow", // Can be used to prevent CSRF
    });

    console.log("🔐 [Outreach OAuth] Redirecting to authorization URL");

    // Redirect to Outreach OAuth
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("❌ [Outreach OAuth] Authorization error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Authorization failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
