import { after, type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import { parseLeadgenWebhook, verifyMetaSignature } from "@/lib/meta-leadgen";
import {
  processNotifications,
  recordLeadNotifications,
} from "@/server/services/meta-leadgen.service";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Subscription handshake: Meta echoes hub.challenge back once the token matches. */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (
    env.META_LEADGEN_VERIFY_TOKEN &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === env.META_LEADGEN_VERIFY_TOKEN
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", {
      headers: { "content-type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Page `leadgen` notifications for the Wander Page. Accept-then-process: the
 * lead ids are stored before the 200 so a failure after it only delays the
 * lead until a manual backfill re-reads the forms. Meta retries non-2xx replies.
 */
export async function POST(request: NextRequest) {
  if (
    !env.META_LEADS_APP_SECRET ||
    !env.META_LEADS_ACCESS_TOKEN ||
    !env.ANTHROPIC_API_KEY
  ) {
    return NextResponse.json(
      { error: "Meta leadgen webhook is not configured" },
      { status: 503 },
    );
  }
  const rawBody = await request.text();
  if (
    !verifyMetaSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      env.META_LEADS_APP_SECRET,
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { notifications, dropped } = parseLeadgenWebhook(rawBody);
  console.log("[meta-leadgen] webhook", {
    leadgenIds: notifications.map((n) => n.leadgen_id),
    dropped,
    // The body is ids only (no answers), so a sample is safe to log.
    ...(dropped > 0 && { sample: rawBody.slice(0, 1000) }),
  });
  await recordLeadNotifications(notifications, "webhook");
  after(async () => {
    try {
      await processNotifications(notifications);
    } catch (err) {
      console.error("[meta-leadgen] webhook processing failed", err);
    }
  });
  return NextResponse.json({ received: notifications.length });
}
