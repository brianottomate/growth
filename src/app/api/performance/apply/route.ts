import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";

import { envSelect } from "@/env";
import { postsPerformanceAlertImmediately } from "@/lib/performance-lead";
import { escapeSlackMrkdwn, postOnSlack } from "@/server/clients/slack.client";
import { db } from "@/server/db";
import { performanceApplicationTable } from "@/server/db/performance-schema";
import {
  normalizePerformanceLead,
  PERFORMANCE_APPLICATIONS_CHANNEL,
  upsertPerformanceLeadContact,
} from "@/server/services/performance-lead.service";
import { HUBSPOT_ACCOUNT_ID } from "@/server/clients/hubspot.client";
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
 * Contacts are projected to HubSpot with Jenny as owner; this funnel never
 * enters the WanderOS AE rota or creates a deal.
 */

/**
 * Alerts go to #radio-performance (PERFORMANCE_APPLICATIONS_CHANNEL), shared
 * with the Meta lead alerts, so #team-performance keeps its signal. Deliberately
 * NOT #radio-core-inbound, which is the WanderOS AE rota's channel; routing
 * there would undo in Slack the separation this route exists to keep.
 */
export const maxDuration = 120;

const SLACK_TESTING_CHANNEL = "radio-slack-testing";

/**
 * Jenny owns every application; Kyle keeps the existing notification.
 *
 * Jenny follows up on every application and Kyle retains visibility in the
 * same Performance applications channel.
 */
const PERFORMANCE_OWNER_SLACK_ID = "U0C5NV73Z9B"; // Jenny Gale Howe
const KYLE_SLACK_ID = "U025DTBSU01";

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
  after(async () => {
    let contactId: string | null = null;
    try {
      const lead = await normalizePerformanceLead({
        formName: "Performance beta website application",
        fields: Object.entries(input)
          .filter(
            ([key, value]) =>
              !["test", "source", "queryParams"].includes(key) &&
              value !== undefined,
          )
          .map(([name, value]) => ({ name, values: [String(value)] })),
      });
      contactId = await upsertPerformanceLeadContact({
        lead: { ...lead, email: input.email.toLowerCase() },
        source: input.source,
        queryParams: input.queryParams,
        test: input.test,
      });
    } catch (error) {
      console.error("[performance/apply] HubSpot projection failed", {
        applicationId: application!.id,
        error,
      });
    }
    // Small applications skip the live alert; the 5pm digest reads them back
    // from performance_application. Test traffic and non-production
    // deployments still post to the testing channel.
    if (
      envSelect({ prod: !input.test, test: false }) &&
      !postsPerformanceAlertImmediately(application!.propertyCount)
    ) {
      return;
    }
    // Alert the desk even when normalization or CRM is temporarily unavailable.
    await notify(application!, input.test, contactId);
  });

  return NextResponse.json({ success: true, id: application!.id });
}

async function notify(
  application: typeof performanceApplicationTable.$inferSelect,
  test?: boolean,
  contactId?: string | null,
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
    application.marketsToday
      ? `Markets today: ${esc(application.marketsToday)}`
      : null,
    application.monthlySpend ? `Spend: ${esc(application.monthlySpend)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const result = await postOnSlack({
    channel: test ? SLACK_TESTING_CHANNEL : PERFORMANCE_APPLICATIONS_CHANNEL,
    text: `🎯 ${application.name ?? application.email} applied to the Performance beta`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `🎯 New *Performance beta* application <@${PERFORMANCE_OWNER_SLACK_ID}> <@${KYLE_SLACK_ID}>\n${facts}\n` +
            (qualifying ? `${qualifying}\n` : "") +
            `from ${esc(application.source)}${application.queryParams ? ` · \`${esc(application.queryParams)}\`` : ""}` +
            (contactId
              ? `\n<https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/contact/${contactId}|View HubSpot contact>`
              : test
                ? ""
                : "\n⚠️ HubSpot sync failed; saved in Growth for follow-up."),
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
