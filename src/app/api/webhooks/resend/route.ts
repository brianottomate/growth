import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "@/env";
import { resend } from "@/server/clients/resend.client";
import { ingestAffiliateEmail } from "@/server/services/affiliate-inbound.service";
import { ingestF5BotEmail } from "@/server/services/f5bot.service";
import { ingestInspirationEmail } from "@/server/services/inspiration-newsletter.service";

// Resend inbound webhook. Fires `email.received` when mail lands on our
// receiving domain (e.g. f5bot@lexaomo.resend.app). The webhook payload carries
// only METADATA — no body — so we fetch the full email via the Received API.
// We route by recipient local-part:
//   f5bot@…             → the F5Bot keyword-alert pipeline
//   inspo+<brand>@…     → competitor-newsletter ingest (token names the brand)
//   affiliate+<prg>@…   → affiliate-program inbox triage (partnerships@ forward)
// Add more providers by pointing them at <provider>@… and branching below.

interface ResendInboundEvent {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
  };
}

function verify(rawBody: string, req: NextRequest): boolean {
  if (!env.RESEND_WEBHOOK_SECRET) {
    console.warn("⚠️ RESEND_WEBHOOK_SECRET not set; skipping signature check");
    return true;
  }
  try {
    resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
    });
    return true;
  } catch (error) {
    console.error("[resend-webhook] signature verification failed:", error);
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  if (!verify(rawBody, request)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: ResendInboundEvent;
  try {
    event = JSON.parse(rawBody) as ResendInboundEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(`[resend-webhook] type=${event.type}`);
  if (event.type !== "email.received") {
    return NextResponse.json({ received: true });
  }

  const emailId = event.data?.email_id;
  const to = event.data?.to ?? [];
  console.log(
    `[resend-webhook] email.received id=${emailId} from=${event.data?.from} to=${to.join(",")} subject="${event.data?.subject}"`,
  );
  if (!emailId) return NextResponse.json({ received: true });

  // The webhook has no body — pull the full email (html/text) from the API.
  const { data: full, error } = await resend.emails.receiving.get(emailId);
  if (error || !full) {
    console.error(`[resend-webhook] failed to fetch email ${emailId}:`, error);
    // 200 so Resend doesn't retry a fetch we can't recover from here.
    return NextResponse.json({ received: true, fetchFailed: true });
  }
  console.log(
    `[resend-webhook] fetched ${emailId}: html=${full.html?.length ?? 0}b text=${full.text?.length ?? 0}b`,
  );

  // Route by recipient local-part. This is the fan-out point.
  const recipient = to.join(",").toLowerCase();
  if (recipient.includes("f5bot")) {
    try {
      const result = await ingestF5BotEmail({
        id: emailId,
        subject: full.subject ?? event.data?.subject ?? "",
        text: full.text,
        html: full.html,
        receivedAt: full.created_at ?? event.created_at,
      });
      console.log(`[resend-webhook] f5bot ingest:`, result);
    } catch (err) {
      console.error(`[resend-webhook] f5bot ingest failed for ${emailId}:`, err);
    }
  } else if (recipient.includes("inspo")) {
    try {
      const result = await ingestInspirationEmail({
        id: emailId,
        recipients: to,
        from: full.from ?? event.data?.from ?? null,
        subject: full.subject ?? event.data?.subject ?? "",
        text: full.text,
        html: full.html,
        receivedAt: full.created_at ?? event.created_at,
      });
      console.log(`[resend-webhook] inspiration ingest:`, result);
    } catch (err) {
      console.error(`[resend-webhook] inspiration ingest failed for ${emailId}:`, err);
    }
  } else if (recipient.includes("affiliate")) {
    try {
      const result = await ingestAffiliateEmail({
        id: emailId,
        recipients: to,
        from: full.from ?? event.data?.from ?? null,
        subject: full.subject ?? event.data?.subject ?? "",
        text: full.text,
        html: full.html,
        receivedAt: full.created_at ?? event.created_at,
      });
      console.log(`[resend-webhook] affiliate ingest:`, result);
    } catch (err) {
      console.error(`[resend-webhook] affiliate ingest failed for ${emailId}:`, err);
    }
  } else {
    console.log(`[resend-webhook] no handler for recipient "${recipient}" — ignored`);
  }

  return NextResponse.json({ received: true });
}
