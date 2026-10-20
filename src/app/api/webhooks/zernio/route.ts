import { after, type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import {
  isZernioDeliveryEvent,
  zernioAdsSyncSchema,
  parseZernioWebhook,
  verifyZernioWebhookSignature,
} from "@/lib/zernio-webhook";
import { reconcileZernioPostDelivery } from "@/server/services/content-publishing.service";
import { activatePublishedSourcePost } from "@/server/services/source-publication-activation.service";
import {
  receiveZernioLead,
  zernioLeadReceivedSchema,
} from "@/server/services/zernio-lead.service";

import {
  queueMetaConnectWebhook,
  runMetaConnectWebhook,
} from "@/server/services/meta-connect-webhook.service";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  if (payload.event === "account.ads.initial_sync_completed") {
    const parsed = zernioAdsSyncSchema.safeParse(payload);
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid ads sync event" },
        { status: 400 },
      );
    const runId = await queueMetaConnectWebhook(parsed.data);
    if (runId) after(() => runMetaConnectWebhook(runId));
    return NextResponse.json(
      { accepted: true, eventId: payload.id },
      { status: 202 },
    );
  }
  if (payload.event === "lead.received") {
    const parsed = zernioLeadReceivedSchema.safeParse(payload);
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid lead event" },
        { status: 400 },
      );
    after(async () => {
      try {
        const outcome = await receiveZernioLead(parsed.data);
        console.log("[zernio-webhook] lead", {
          eventId: payload.id,
          leadgenId: parsed.data.lead.leadgenId,
          outcome,
        });
      } catch (error) {
        console.error("[zernio-webhook] lead failed", {
          eventId: payload.id,
          leadgenId: parsed.data.lead.leadgenId,
          error,
        });
      }
    });
    return NextResponse.json(
      { accepted: true, eventId: payload.id },
      { status: 202 },
    );
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
      const result = await reconcileZernioPostDelivery(providerPostId);
      const activation =
        result.matched && result.delivery.deliveryStatus === "published"
          ? await activatePublishedSourcePost(result.rootPlatformPostId)
          : null;
      console.log("[zernio-webhook] reconciliation complete", {
        eventId: payload.id,
        providerPostId,
        matched: result.matched,
        activation,
      });
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
