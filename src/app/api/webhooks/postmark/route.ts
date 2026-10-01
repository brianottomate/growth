import { createHash, timingSafeEqual } from "crypto";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import { db } from "@/server/db";
import { postmarkEventTable } from "@/server/db/schema";

// Webhooks on the Postmark servers Growth owns (one per Performance brand)
// post here. Postmark sends the shared secret as a custom header; it retries
// anything that is not a 200, so a failed insert must surface as a 500.
// Open and Click payloads carry no ServerID, so each webhook also sends its
// server id as a header.

const SECRET_HEADER = "x-growth-postmark-secret";
const SERVER_HEADER = "x-growth-postmark-server";

function authorized(request: NextRequest): boolean {
  const expected = env.POSTMARK_WEBHOOK_SECRET;
  const actual = request.headers.get(SECRET_HEADER);
  if (!expected || !actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function date(value: string | null): Date | null {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Expected an object" }, { status: 400 });
  }
  // `Content` is the full bounced or reported message; never keep it.
  const { Content: _content, ...event } = body as Record<string, unknown>;

  const recordType = text(event.RecordType);
  if (!recordType) {
    return NextResponse.json({ error: "Missing RecordType" }, { status: 400 });
  }

  // Bounce and SpamComplaint carry the address in `Email`; the rest in `Recipient`.
  const recipient = text(event.Recipient) ?? text(event.Email);
  const occurredAt =
    text(event.DeliveredAt) ??
    text(event.BouncedAt) ??
    text(event.ChangedAt) ??
    text(event.ReceivedAt);
  const headerServerId = Number(request.headers.get(SERVER_HEADER));
  const serverId =
    typeof event.ServerID === "number"
      ? event.ServerID
      : Number.isInteger(headerServerId) && headerServerId > 0
        ? headerServerId
        : null;

  await db
    .insert(postmarkEventTable)
    .values({
      serverId,
      messageStream: text(event.MessageStream),
      recordType,
      messageId: text(event.MessageID),
      recipient: recipient?.toLowerCase() ?? null,
      tag: text(event.Tag),
      occurredAt: date(occurredAt),
      payload: event,
      dedupeKey: createHash("sha256")
        .update(JSON.stringify(event))
        .digest("hex"),
    })
    .onConflictDoNothing();

  return NextResponse.json({ received: true });
}
