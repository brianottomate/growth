import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "@/env";
import { MediaService } from "@/server/services/media.service";

// Cloudflare Stream fires this when a video finishes transcoding. We verify the
// `Webhook-Signature: time=...,sig1=...` header (HMAC-SHA256 over `${time}.${body}`)
// then flip the matching media_asset to `ready`.

interface StreamWebhookBody {
  uid: string;
  readyToStream?: boolean;
  status?: { state?: string };
  duration?: number;
  thumbnail?: string;
  input?: { width?: number; height?: number };
}

function verifySignature(rawBody: string, header: string | null): boolean {
  if (!env.CLOUDFLARE_STREAM_WEBHOOK_SECRET) {
    // No secret configured (dev) — accept but log.
    console.warn("⚠️ Stream webhook secret not set; skipping signature check");
    return true;
  }
  if (!header) return false;
  const parts = Object.fromEntries(
    header
      .split(",")
      .map((kv) => kv.split("=").map((s) => s.trim()) as [string, string]),
  );
  const time = parts.time;
  const sig = parts.sig1;
  if (!time || !sig) return false;

  const expected = createHmac("sha256", env.CLOUDFLARE_STREAM_WEBHOOK_SECRET)
    .update(`${time}.${rawBody}`)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("webhook-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: StreamWebhookBody;
  try {
    body = JSON.parse(rawBody) as StreamWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.uid) {
    return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  }

  if (body.readyToStream || body.status?.state === "ready") {
    const updated = await MediaService.markVideoReady(body.uid, {
      duration: body.duration ? Math.round(body.duration) : undefined,
      thumbnailUrl: body.thumbnail,
      width: body.input?.width,
      height: body.input?.height,
    });
    console.log(
      updated
        ? `✅ Stream ready: ${body.uid} → ${updated.id}`
        : `⚠️ Stream webhook for unknown uid: ${body.uid}`,
    );
  }

  return NextResponse.json({ received: true });
}
