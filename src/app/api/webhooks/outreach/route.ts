import { type NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/env";

type JsonRecord = Record<string, unknown>;

interface OutreachWebhookData {
  type?: string;
  id?: string;
  attributes?: {
    installedAt?: string;
  };
  relationships?: {
    org?: {
      data?: {
        id?: string;
      };
    };
  };
}

interface OutreachWebhookPayload {
  meta?: {
    eventName?: string;
  };
  data?: OutreachWebhookData;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function parseWebhookPayload(raw: string): OutreachWebhookPayload {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) return {};

  const payload: OutreachWebhookPayload = {};

  if (isRecord(parsed.meta)) {
    payload.meta = {
      eventName:
        typeof parsed.meta.eventName === "string"
          ? parsed.meta.eventName
          : undefined,
    };
  }

  if (isRecord(parsed.data)) {
    const data: OutreachWebhookData = {
      type: typeof parsed.data.type === "string" ? parsed.data.type : undefined,
      id: typeof parsed.data.id === "string" ? parsed.data.id : undefined,
    };

    if (isRecord(parsed.data.attributes)) {
      data.attributes = {
        installedAt:
          typeof parsed.data.attributes.installedAt === "string"
            ? parsed.data.attributes.installedAt
            : undefined,
      };
    }

    if (isRecord(parsed.data.relationships) && isRecord(parsed.data.relationships.org)) {
      const orgData = isRecord(parsed.data.relationships.org.data)
        ? parsed.data.relationships.org.data
        : undefined;
      data.relationships = {
        org: {
          data: {
            id: orgData && typeof orgData.id === "string" ? orgData.id : undefined,
          },
        },
      };
    }

    payload.data = data;
  }

  return payload;
}

function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;

  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");

  const actual = signature.trim();
  if (actual.length !== expectedSignature.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(actual, "utf8"),
      Buffer.from(expectedSignature, "utf8"),
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const body = parseWebhookPayload(rawBody);
    const webhookId = request.headers.get("outreach-webhook-id");
    const eventName = body.meta?.eventName || body.data?.type;

    if (env.OUTREACH_WEBHOOK_SECRET) {
      const signature = request.headers.get("outreach-webhook-signature");
      const isValid = verifyWebhookSignature(
        rawBody,
        signature,
        env.OUTREACH_WEBHOOK_SECRET,
      );

      if (!isValid) {
        console.error("❌ [Outreach Webhook] Invalid signature");
        return NextResponse.json(
          {
            success: false,
            error: "Invalid webhook signature",
          },
          { status: 401 },
        );
      }
    }

    const eventType = body.data?.type;
    const installId = body.data?.id;
    const installedAt = body.data?.attributes?.installedAt;
    const orgId = body.data?.relationships?.org?.data?.id;

    if (eventType === "install") {
      console.log(
        `✅ [Outreach Webhook] install received (installId=${installId ?? "unknown"}, orgId=${orgId ?? "unknown"})`,
      );
    } else if (eventType === "uninstall") {
      console.log(
        `ℹ️ [Outreach Webhook] uninstall received (installId=${installId ?? "unknown"})`,
      );
    } else {
      console.log(
        `ℹ️ [Outreach Webhook] event received (event=${eventName ?? "unknown"}, webhookId=${webhookId ?? "unknown"})`,
      );
    }

    return NextResponse.json({
      success: true,
      eventType: eventType ?? null,
      installId: installId ?? null,
      orgId: orgId ?? null,
      installedAt: installedAt ?? null,
    });
  } catch (error) {
    console.error("❌ [Outreach Webhook] Error processing webhook:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process webhook",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  const webhookUrl = `${env.NEXT_PUBLIC_BASE_URL}/api/webhooks/outreach`;
  return NextResponse.json({
    success: true,
    message: "Outreach webhook endpoint ready",
    webhookUrl,
    signatureVerificationEnabled: Boolean(env.OUTREACH_WEBHOOK_SECRET),
  });
}
