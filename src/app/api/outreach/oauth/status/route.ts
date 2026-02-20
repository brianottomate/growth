import { NextResponse } from "next/server";
import {
  hasOAuthTokens,
  isOAuthConfigured,
  isS2SConfigured,
} from "@/server/clients/outreach.client";

/**
 * OAuth Status Check
 *
 * GET /api/outreach/oauth/status
 *
 * Check if OAuth tokens are cached for a user
 */
export async function GET() {
  const testUserId = "test-user";
  const hasTokens = hasOAuthTokens(testUserId);

  return NextResponse.json({
    oauthConfigured: isOAuthConfigured,
    s2sConfigured: isS2SConfigured,
    hasOAuthTokens: hasTokens,
    userId: testUserId,
    message: hasTokens
      ? "✅ OAuth tokens found in cache"
      : "❌ No OAuth tokens in cache (authorize at /api/outreach/oauth/authorize)",
  });
}
