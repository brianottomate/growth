import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";

import { escapeSlackMrkdwn, postOnSlack } from "@/server/clients/slack.client";
import { db } from "@/server/db";
import { performanceApplicationTable } from "@/server/db/performance-schema";
import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";

/**
 * Performance beta applications, from wander.com's /api/performance/apply.
 *
 * Writes the row and says so in Slack. It deliberately does NOT create a
 * prospect brand: an application is a claim a stranger made about themselves,
 * a brand is a thing Wander works on, and minting the second from the first
 * means a form can put anyone straight onto the desk. A rep who wants to work
 * one promotes it with the code that already turns a lead into a prospect.
 *
 * HubSpot is untouched for the same reason /api/hubspot/v1/inbound is not the
 * route for this: that one feeds the WanderOS AE rota, and these are not those
 * leads.
 */

/** Same channel the inbound lead router and the pregen beacon post to. */
const RADIO_CORE_INBOUND_CHANNEL_ID = "C0A3PMXE3MG";
const SLACK_TESTING_CHANNEL = "radio-slack-testing";

const body = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email")),
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  directBookingSiteUrl: z.string().trim().min(1).max(500).optional(),
  numberOfProperties: z.coerce.number().int().min(0).max(10_000).optional(),
  doesMarketingToday: z.string().trim().min(1).max(500).optional(),
  monthlyMarketingSpend: z.string().trim().min(1).max(500).optional(),
  source: z.string().trim().min(1).max(120).default("performance-beta"),
  queryParams: z.string().trim().max(2_000).optional(),
  test: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  // Defense in depth, the same rule the inbound route applies.
  if (input.email.toLowerCase().endsWith("@wander.com")) {
    return NextResponse.json({ success: true, skipped: "internal email" });
  }

  const name =
    [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || null;

  const [application] = await db
    .insert(performanceApplicationTable)
    .values({
      email: input.email,
      name,
      websiteUrl: input.directBookingSiteUrl ?? null,
      propertyCount: input.numberOfProperties ?? null,
      marketsToday: input.doesMarketingToday ?? null,
      monthlySpend: input.monthlyMarketingSpend ?? null,
      source: input.source,
      queryParams: input.queryParams ?? null,
    })
    .returning();

  // The row is the record; the ping is how anyone finds out. Deferred so a
  // Slack hiccup cannot fail a write that already succeeded.
  after(() => notify(application!, input.test));

  return NextResponse.json({ success: true, id: application!.id });
}

async function notify(
  application: typeof performanceApplicationTable.$inferSelect,
  test?: boolean,
) {
  const esc = escapeSlackMrkdwn;
  const facts = [
    application.name ? `*${esc(application.name)}*` : null,
    esc(application.email),
    application.websiteUrl ? esc(application.websiteUrl) : "no site given",
    typeof application.propertyCount === "number"
      ? `${application.propertyCount} properties`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // The two qualifying answers are the whole reason the form exists, so they
  // get their own line rather than being folded into the facts run.
  const qualifying = [
    application.marketsToday ? `Markets today: ${esc(application.marketsToday)}` : null,
    application.monthlySpend ? `Spend: ${esc(application.monthlySpend)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const result = await postOnSlack({
    channel: test ? SLACK_TESTING_CHANNEL : RADIO_CORE_INBOUND_CHANNEL_ID,
    text: `🎯 ${application.name ?? application.email} applied to the Performance beta`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `🎯 New *Performance beta* application\n${facts}\n` +
            (qualifying ? `${qualifying}\n` : "") +
            `from ${esc(application.source)}${application.queryParams ? ` · \`${esc(application.queryParams)}\`` : ""}`,
        },
      },
    ],
    unfurl_links: false,
    unfurl_media: false,
  });

  if (!result.success) {
    console.error("[performance/apply] Slack post failed", result.error);
  }
}
