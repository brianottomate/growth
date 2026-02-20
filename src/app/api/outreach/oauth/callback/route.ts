import { type NextRequest, NextResponse } from "next/server";
import {
  exchangeOAuthCode,
  storeOAuthTokens,
  isOAuthConfigured,
} from "@/server/clients/outreach.client";
import { env } from "@/env";

/**
 * OAuth Callback Endpoint
 *
 * GET /api/outreach/oauth/callback
 *
 * Handles the redirect from Outreach after user authorization.
 * Exchanges the authorization code for access + refresh tokens.
 */
export async function GET(request: NextRequest) {
  if (!isOAuthConfigured) {
    return NextResponse.json(
      {
        success: false,
        error: "OAuth not configured",
      },
      { status: 500 },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Check for OAuth errors
  if (error) {
    console.error("❌ [Outreach OAuth] Authorization denied:", error, errorDescription);

    return new NextResponse(
      `
<!DOCTYPE html>
<html>
<head>
  <title>Authorization Failed</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 600px;
      margin: 40px auto;
      padding: 20px;
    }
    .error {
      background: #fee;
      border: 1px solid #fcc;
      border-radius: 8px;
      padding: 20px;
      color: #c00;
    }
  </style>
</head>
<body>
  <h1>❌ Authorization Failed</h1>
  <div class="error">
    <p><strong>Error:</strong> ${error}</p>
    <p>${errorDescription ?? "User denied authorization"}</p>
  </div>
  <p><a href="/api/outreach/oauth/authorize">Try again</a></p>
</body>
</html>
      `,
      {
        status: 400,
        headers: {
          "Content-Type": "text/html",
        },
      },
    );
  }

  if (!code) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing authorization code",
      },
      { status: 400 },
    );
  }

  try {
    const baseUrl = env.NEXT_PUBLIC_BASE_URL;
    const redirectUri = `${baseUrl}/api/outreach/oauth/callback`;

    console.log("🔄 [Outreach OAuth] Exchanging authorization code");

    // Exchange code for tokens
    const tokens = await exchangeOAuthCode({
      code,
      redirectUri,
    });

    // Store tokens (using a test user ID for now)
    // TODO: Get actual user ID from session
    const userId = "test-user";
    storeOAuthTokens({
      userId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });

    console.log("✅ [Outreach OAuth] Authorization complete");

    // Return success page
    return new NextResponse(
      `
<!DOCTYPE html>
<html>
<head>
  <title>Authorization Successful</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 600px;
      margin: 40px auto;
      padding: 20px;
    }
    .success {
      background: #d4edda;
      border: 1px solid #c3e6cb;
      border-radius: 8px;
      padding: 20px;
    }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <h1>✅ Authorization Successful!</h1>
  <div class="success">
    <p><strong>Outreach OAuth connected successfully!</strong></p>
    <p>Your tokens have been stored for user: <code>${userId}</code></p>
    <p>Token expires in: <strong>${Math.floor(tokens.expiresIn / 60)} minutes</strong></p>
  </div>

  <h2>Next Steps:</h2>
  <ul>
    <li>Test the connection: <a href="/api/test/outreach">/api/test/outreach</a></li>
    <li>The API will now use OAuth authentication for this user</li>
  </ul>

  <h3>Try it in your browser console:</h3>
  <pre><code>// Test OAuth authentication
fetch('/api/test/outreach')
  .then(r => r.json())
  .then(console.log)</code></pre>
</body>
</html>
      `,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      },
    );
  } catch (error) {
    console.error("❌ [Outreach OAuth] Callback error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Token exchange failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
