import { NextResponse } from "next/server";
import {
  isOutreachConfigured,
  isOAuthConfigured,
  isS2SConfigured,
  testConnection,
  getProspects,
  isOutreachError,
  hasOAuthTokens,
} from "@/server/clients/outreach.client";

/**
 * Test endpoint to verify Outreach S2S integration works
 *
 * GET /api/test/outreach
 *
 * This endpoint demonstrates:
 * - S2S authentication flow (JWT generation → token exchange)
 * - Token caching
 * - API calls to Outreach
 * - Error handling
 */
export async function GET() {
  // Check if Outreach is configured
  if (!isOutreachConfigured) {
    return NextResponse.json(
      {
        success: false,
        error: "Outreach is not configured",
        message:
          "Set either S2S (GUID, PRIVATE_KEY, INSTALL_ID) or OAuth (CLIENT_ID, CLIENT_SECRET) credentials in your .env.local",
        hint: isOAuthConfigured
          ? "OAuth is configured! Visit /api/outreach/oauth/authorize to connect"
          : "Configure either S2S or OAuth to get started",
      },
      { status: 500 },
    );
  }

  // Determine which auth method to use
  const testUserId = "test-user";
  const useOAuth = isOAuthConfigured && hasOAuthTokens(testUserId);
  const authMethod = useOAuth ? "OAuth" : isS2SConfigured ? "S2S" : "None";

  console.log(`🧪 [Outreach Test] Using ${authMethod} authentication`);

  try {
    // 1. Test connection
    console.log("🧪 [Outreach Test] Testing connection...");
    const connectionTest = await testConnection(
      useOAuth ? { userId: testUserId } : undefined,
    );

    if (!connectionTest.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Connection test failed",
          message: connectionTest.message,
        },
        { status: 500 },
      );
    }

    // 2. Fetch sample prospects (more to find real ones)
    console.log("🧪 [Outreach Test] Fetching sample prospects...");
    const prospectsResponse = await getProspects({
      pageSize: 25, // Fetch more to find real prospects
      userId: useOAuth ? testUserId : undefined,
    });

    // 3. Format sample data
    const sampleProspects = prospectsResponse.data.map((prospect) => ({
      id: prospect.id,
      name: prospect.attributes.name,
      firstName: prospect.attributes.firstName,
      lastName: prospect.attributes.lastName,
      email: prospect.attributes.emails[0] ?? null,
      title: prospect.attributes.title,
      company: prospect.attributes.company,
    }));

    console.log(
      `✅ [Outreach Test] Successfully fetched ${sampleProspects.length} prospects`,
    );
    console.log("📋 [Outreach Test] Prospect details:");
    sampleProspects.forEach((p, i) => {
      console.log(
        `  ${i + 1}. ${p.name} (${p.email}) - ${p.title || "No title"} @ ${p.company || "No company"}`
      );
    });

    return NextResponse.json({
      success: true,
      message: `Outreach integration working (${authMethod})`,
      authMethod,
      data: {
        prospectCount: prospectsResponse.meta?.count ?? sampleProspects.length,
        sampleProspects,
      },
      instructions: [
        `Currently using: ${authMethod} authentication`,
        "Check server logs for 🔐, ♻️, and ✅ emojis showing token caching",
        "Make multiple requests to see cached token reuse",
        isOAuthConfigured && !useOAuth
          ? "To use OAuth: Visit /api/outreach/oauth/authorize"
          : "Token will auto-refresh before expiry",
      ],
    });
  } catch (error) {
    console.error("❌ [Outreach Test] Error:", error);

    if (isOutreachError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "Outreach API error",
          message: error.message,
          isRateLimited: error.isRateLimited,
          retryAfter: error.retryAfter,
        },
        { status: error.statusCode ?? 500 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Unknown error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
