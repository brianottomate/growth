import { after, type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import {
  isZernioDeliveryEvent,
  parseZernioWebhook,
  verifyZernioWebhookSignature,
} from "@/lib/zernio-webhook";
import { reconcileZernioPostDelivery } from "@/server/services/content-publishing.service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!env.ZERNIO_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Zernio webhook is not configured" },
      { status: 503 },
    );
  }
  const rawBody = await request.text();
  if (
    !verifyZernioWebhookSignature(
      rawBody,
      request.headers.get("x-zernio-signature"),
      env.ZERNIO_WEBHOOK_SECRET,
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const payload = parseZernioWebhook(rawBody);
  if (!payload)
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  if (payload.event === "webhook.test") {
    return NextResponse.json({ accepted: true, eventId: payload.id });
  }
  if (!isZernioDeliveryEvent(payload.event)) {
    return NextResponse.json({ accepted: true, ignored: true });
  }
  if (!payload.post?.id) {
    return NextResponse.json(
      { error: "Delivery event is missing its post id" },
      { status: 400 },
    );
  }

  const providerPostId = payload.post.id;
  after(async () => {
    try {
      await reconcileZernioPostDelivery(providerPostId);
    } catch (error) {
      console.error("[zernio-webhook] reconciliation failed", {
        eventId: payload.id,
        providerPostId,
        error,
      });
    }
  });
  return NextResponse.json(
    { accepted: true, eventId: payload.id },
    { status: 202 },
  );
}
