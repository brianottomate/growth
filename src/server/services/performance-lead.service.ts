import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import type { LeadFieldData } from "@/lib/meta-leadgen";
import { isQualifiedPerformanceLead } from "@/lib/performance-lead";
import {
  HUBSPOT_ACCOUNT_ID,
  updateContact,
  upsertContact,
} from "@/server/clients/hubspot.client";
import { escapeSlackMrkdwn, postOnSlack } from "@/server/clients/slack.client";
import {
  META_LEAD_NORMALIZATION_SYSTEM,
  metaLeadNormalizationSchema,
} from "./meta-lead-normalization.service";

// Verified active HubSpot owner and Slack member, 2026-10-22.
const JENNY_HUBSPOT_OWNER_ID = "101168977";
const JENNY_SLACK_ID = "U0C5NV73Z9B";
const KYLE_SLACK_ID = "U025DTBSU01";
const PERFORMANCE_CHANNEL = "C0BSSECHK08"; // #team-performance

const schema = metaLeadNormalizationSchema.extend({
  directBookingStatus: z.enum(["live", "building", "none", "unknown"]),
  primaryInterest: z.string().nullable(),
  marketsToday: z.string().nullable(),
  monthlySpend: z.string().nullable(),
  qualificationReason: z.string().max(500),
});
export type PerformanceLead = z.infer<typeof schema>;

export async function normalizePerformanceLead(input: {
  fields: LeadFieldData;
  formName: string | null;
}): Promise<PerformanceLead> {
  const prompt = JSON.stringify(input);
  if (prompt.length > 24000)
    throw new Error("Performance form exceeds input limit");
  const { output } = await generateText({
    model: anthropic("claude-sonnet-5"),
    output: Output.object({ schema }),
    system: `${META_LEAD_NORMALIZATION_SYSTEM}

This is a Performance by Wander marketing-services application, not a WanderOS software lead. Extract directBookingStatus from the answers: live, building, none, or unknown. A supplied company/direct booking URL is evidence of live status unless another answer contradicts it; a portfolio/social/OTA link alone is not. Interpret option keys as their labels: managed_properties 1_9 = 1-9, 10_24 = 10-24, 25_99 = 25-99, 100_499 = 100-499, 500_plus = 500+. For direct_booking_site, yes means live, building means building, no means none. Keep marketing interest, current marketing activity, and monthly spend in their own fields; do not invent them.

Write a short qualificationReason using only submitted facts. Initial beta qualification requires an operator with at least one currently managed property, a live direct-booking site, and a supplied direct-booking/company URL. Missing evidence means not qualified yet; all applicants still go to Jenny for follow-up. Do not apply the WanderOS 10-property rule.`,
    prompt,
    maxOutputTokens: 1500,
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(30000),
  });
  return output;
}

/** Upsert every contact, explicitly assign Jenny, then reuse the Performance alert. */
type PerformanceLeadInput = {
  lead: PerformanceLead;
  source: string;
  queryParams?: string | null;
  test?: boolean;
};

export async function upsertPerformanceLeadContact(
  input: PerformanceLeadInput,
): Promise<string | null> {
  const { lead } = input;
  if (!lead.email)
    throw new Error("Performance application has no usable email");
  const siteUrl = lead.bookingSite
    ? `https://${lead.bookingSite.hostname}${lead.bookingSite.pathname}`
    : null;
  const qualified = isQualifiedPerformanceLead(lead);
  let contactId: string | null = null;
  // Explicit test submissions must never create or reassign CRM contacts.
  if (!input.test) {
    const contact = await upsertContact(lead.email, {
      ...(lead.firstName && { firstname: lead.firstName }),
      ...(lead.lastName && { lastname: lead.lastName }),
      ...(lead.phone && { phone: lead.phone }),
    });
    contactId = contact.id;
    await updateContact(contact.id, {
      hubspot_owner_id: JENNY_HUBSPOT_OWNER_ID,
      ...(lead.minimumUnits !== null && {
        portfolio_size_inbound_form: String(lead.minimumUnits),
      }),
      ...(siteUrl && { direct_booking_site_inbound_form: siteUrl }),
      ...(lead.pms && { pms_inbound_form: lead.pms }),
      message: [
        `Performance beta · ${qualified ? "Qualified" : "Not qualified yet"}: ${lead.qualificationReason}`,
        `Source: ${input.source}`,
        lead.primaryInterest && `Interest: ${lead.primaryInterest}`,
        lead.marketsToday && `Markets today: ${lead.marketsToday}`,
        lead.monthlySpend && `Monthly spend: ${lead.monthlySpend}`,
        input.queryParams && `Attribution: ${input.queryParams}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }
  return contactId;
}

export async function routePerformanceLead(
  input: PerformanceLeadInput,
): Promise<string | null> {
  const contactId = await upsertPerformanceLeadContact(input);
  const { lead } = input;
  if (!lead.email)
    throw new Error("Performance application has no usable email");
  const siteUrl = lead.bookingSite
    ? `https://${lead.bookingSite.hostname}${lead.bookingSite.pathname}`
    : null;
  const qualified = isQualifiedPerformanceLead(lead);
  const esc = escapeSlackMrkdwn;
  const name =
    [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email;
  const lines = [
    `🎯 New *Performance beta* application <@${JENNY_SLACK_ID}> <@${KYLE_SLACK_ID}>${input.test ? " (test)" : ""}`,
    `${esc(name)} · ${esc(lead.email)}${lead.phone ? ` · ${esc(lead.phone)}` : ""}`,
    `${lead.minimumUnits ?? "Unknown"} properties · ${esc(siteUrl ?? "no direct site given")}`,
    `*${qualified ? "Qualified" : "Not qualified yet"}*: ${esc(lead.qualificationReason)}`,
    lead.primaryInterest && `Interest: ${esc(lead.primaryInterest)}`,
    lead.marketsToday && `Markets today: ${esc(lead.marketsToday)}`,
    lead.monthlySpend && `Spend: ${esc(lead.monthlySpend)}`,
    `from ${esc(input.source)}${input.queryParams ? ` · ${esc(input.queryParams)}` : ""}`,
    contactId &&
      `<https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/contact/${contactId}|View HubSpot contact>`,
  ].filter((line): line is string => Boolean(line));
  const posted = await postOnSlack({
    channel: input.test ? "radio-slack-testing" : PERFORMANCE_CHANNEL,
    text: `Performance beta application: ${name}`,
    blocks: lines.map((line) => ({
      type: "section",
      text: { type: "mrkdwn", text: line.slice(0, 2900) },
    })),
    unfurl_links: false,
    unfurl_media: false,
  });
  if (!posted.success)
    throw new Error(`Performance Slack alert failed: ${posted.error}`);
  return contactId;
}
