import { type NextRequest, NextResponse } from "next/server";
import { SignJWT, importPKCS8 } from "jose";
import { env } from "@/env";

/**
 * Outreach App Installation Handler
 *
 * This endpoint handles the redirect after an admin installs the Wander Growth app.
 * It receives an installSetupToken and exchanges it for the permanent INSTALL_ID.
 *
 * Setup in Outreach Developer Portal:
 * - Set "External configuration setup URL" to: https://your-domain.com/api/outreach/install
 *
 * Flow:
 * 1. Admin installs app → Outreach redirects to this URL with ?installSetupToken=...
 * 2. We exchange the token for INSTALL_ID
 * 3. Display the INSTALL_ID to copy into .env
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const installSetupToken = searchParams.get("installSetupToken");

  if (!installSetupToken) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing installSetupToken",
        message:
          "This endpoint should be called by Outreach after app installation with an installSetupToken parameter.",
      },
      { status: 400 },
    );
  }

  try {
    // Generate APP_TOKEN (JWT signed with private key)
    console.log("🔐 [Outreach Install] Generating app token...");

    if (!env.OUTREACH_S2S_GUID || !env.OUTREACH_PRIVATE_KEY) {
      throw new Error("Missing S2S configuration");
    }

    // Parse private key
    const privateKeyPem = env.OUTREACH_PRIVATE_KEY.replace(/\\n/g, "\n");
    const privateKey = await importPKCS8(privateKeyPem, "RS256");

    // Create JWT
    const appToken = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(env.OUTREACH_S2S_GUID)
      .setAudience("https://api.outreach.io/api/v2/oauth/token")
      .setExpirationTime("5m")
      .setIssuedAt()
      .sign(privateKey);

    // Exchange installSetupToken for INSTALL_ID
    console.log("🔄 [Outreach Install] Exchanging setup token for install ID...");

    const response = await fetch(
      `https://api.outreach.io/api/v2/oauth/app/installs/${installSetupToken}/actions/setupToken`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.api+json",
          Authorization: `Bearer ${appToken}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ [Outreach Install] Setup token exchange failed:", errorText);
      throw new Error(`Setup token exchange failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      data: {
        type: "install";
        id: string;
        attributes: {
          installedAt: string;
        };
        relationships: {
          org: {
            data: {
              type: "org";
              id: string;
            };
            links: {
              api: string;
            };
          };
        };
      };
    };

    const installId = data.data.id;
    const orgId = data.data.relationships.org.data.id;
    const installedAt = data.data.attributes.installedAt;

    console.log("✅ [Outreach Install] Successfully obtained install ID:", installId);

    // Return HTML page with the install ID
    return new NextResponse(
      `
<!DOCTYPE html>
<html>
<head>
  <title>Outreach Installation Complete</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
    .success {
      background: #d4edda;
      border: 1px solid #c3e6cb;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .code-block {
      background: #f4f4f4;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 15px;
      font-family: monospace;
      margin: 10px 0;
      position: relative;
    }
    .copy-btn {
      position: absolute;
      right: 10px;
      top: 10px;
      padding: 5px 10px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .copy-btn:hover {
      background: #0056b3;
    }
    h1 { color: #28a745; }
    .info { color: #666; }
  </style>
</head>
<body>
  <h1>✅ Outreach App Installation Complete!</h1>

  <div class="success">
    <h2>Installation Details</h2>
    <p><strong>Install ID:</strong> ${installId}</p>
    <p><strong>Organization ID:</strong> ${orgId}</p>
    <p><strong>Installed At:</strong> ${installedAt}</p>
  </div>

  <h2>Next Steps</h2>
  <p>Copy your Install ID and update your <code>.env</code> file:</p>

  <div class="code-block">
    <button class="copy-btn" onclick="copyToClipboard('${installId}')">Copy</button>
    <pre>OUTREACH_INSTALL_ID="${installId}"</pre>
  </div>

  <h3>Command to update .env:</h3>
  <div class="code-block">
    <pre>cd playground
# Update OUTREACH_INSTALL_ID in .env to: ${installId}
# Then restart your dev server</pre>
  </div>

  <p class="info">
    After updating your .env file, restart your dev server and test the integration at:
    <br><a href="/api/test/outreach">/api/test/outreach</a>
  </p>

  <script>
    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        alert('Install ID copied to clipboard!');
      });
    }
  </script>
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
    console.error("❌ [Outreach Install] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Installation failed",
        message: error instanceof Error ? error.message : "Unknown error",
        hint: "Check server logs for details",
      },
      { status: 500 },
    );
  }
}
