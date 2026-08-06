import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import { leadContactTable } from "@/server/db/leads-schema";
import type { WebhookPayload } from "@/server/clients/instantly.types";

// Instantly webhook. Registered workspace-wide (see
// scripts/register-instantly-webhook.ts) so reply/interest events for any
// campaign land here. Unlike the Resend inbound hook, Instantly's payload
// carries the full reply text inline — no follow-up fetch needed.
//
// Auth: Instantly has no payload signing, so we set a shared-secret header at
// registration time and check it here. Sending mailbox stays the source of
// truth for the actual conversation (Instantly Unibox); this just mirrors
// reply/interest signals onto leadContact so they surface in /app/leads.

// Instantly lt_interest_status codes, keyed by the webhook event that implies them.
const INTEREST_BY_EVENT: Record<string, number> = {
  lead_interested: 1,
  lead_meeting_booked: 2,
  lead_meeting_completed: 3,
  lead_closed: 4,
  lead_out_of_office: 0,
  lead_wrong_person: -1,
  lead_not_interested: -2,
  lead_no_show: -3,
};

function authorized(req: NextRequest): boolean {
  const secret = env.INSTANTLY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("⚠️ INSTANTLY_WEBHOOK_SECRET not set; skipping auth check");
    return true;
  }
  return req.headers.get("x-webhook-secret") === secret;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: WebhookPayload;
  try {
    event = (await request.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = event.lead_email?.trim().toLowerCase();
  console.log(
    `[instantly-webhook] event=${event.event_type} lead=${email ?? "?"} campaign="${event.campaign_name ?? ""}"`,
  );
  if (!email) return NextResponse.json({ received: true });

  // Build the field updates this event implies. Match leadContact by email
  // (the send grain); a lead may exist under one domain, update all matches.
  const set: Record<string, unknown> = { updatedAt: new Date() };

  if (event.event_type === "reply_received") {
    set.emailReplyCount = sql`${leadContactTable.emailReplyCount} + 1`;
    set.lastContactedAt = new Date();
  }
  const interest = INTEREST_BY_EVENT[event.event_type];
  if (interest !== undefined) set.interestStatus = interest;

  // Nothing actionable for this event type (e.g. email_opened we don't track here).
  if (Object.keys(set).length === 1) {
    return NextResponse.json({ received: true, ignored: event.event_type });
  }

  const updated = await db
    .update(leadContactTable)
    .set(set)
    .where(
      and(
        eq(leadContactTable.email, email),
        isNull(leadContactTable.deletedAt),
      ),
    )
    .returning({ id: leadContactTable.id });

  console.log(
    `[instantly-webhook] updated ${updated.length} contact(s) for ${email}`,
  );
  return NextResponse.json({ received: true, updated: updated.length });
}
