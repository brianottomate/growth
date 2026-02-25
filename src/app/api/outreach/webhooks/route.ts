import { type NextRequest, NextResponse } from "next/server";
import {
  createOutreachWebhook,
  listOutreachWebhooks,
  isOutreachConfigured,
  isOutreachError,
} from "@/server/clients/outreach.client";

/**
 * Outreach webhook management endpoint.
 *
 * GET  /api/outreach/webhooks          — list all registered webhooks
 * POST /api/outreach/webhooks          — register a new webhook
 *   body: { url, resource, action, secret?, payloadVersion? }
 */

export async function GET() {
  if (!isOutreachConfigured) {
    return NextResponse.json(
      { success: false, error: "Outreach is not configured" },
      { status: 500 },
    );
  }

  try {
    const webhooks = await listOutreachWebhooks();
    return NextResponse.json({ success: true, count: webhooks.length, webhooks });
  } catch (error) {
    console.error("❌ [Outreach Webhooks] List error:", error);
    if (isOutreachError(error)) {
      return NextResponse.json(
        { success: false, error: error.message, statusCode: error.statusCode },
        { status: error.statusCode ?? 500 },
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isOutreachConfigured) {
    return NextResponse.json(
      { success: false, error: "Outreach is not configured" },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      url?: string;
      resource?: string;
      action?: string;
      secret?: string;
      payloadVersion?: 1 | 2;
    };

    if (!body.url || !body.resource || !body.action) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: url, resource, action" },
        { status: 400 },
      );
    }

    const webhook = await createOutreachWebhook({
      url: body.url,
      resource: body.resource,
      action: body.action,
      secret: body.secret,
      payloadVersion: body.payloadVersion,
    });

    console.log(
      `✅ [Outreach Webhooks] Created: id=${webhook.id} url=${webhook.url} resource=${webhook.resource} action=${webhook.action}`,
    );

    return NextResponse.json({ success: true, webhook });
  } catch (error) {
    console.error("❌ [Outreach Webhooks] Create error:", error);
    if (isOutreachError(error)) {
      return NextResponse.json(
        { success: false, error: error.message, statusCode: error.statusCode },
        { status: error.statusCode ?? 500 },
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
