import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import { envSelect } from "@/env";
import type { LeadFieldData } from "@/lib/meta-leadgen";
import {
  isQualifiedPerformanceLead,
  PERFORMANCE_DIGEST_MAX_UNITS,
  PERFORMANCE_META_FORM_IDS,
  postsPerformanceAlertImmediately,
} from "@/lib/performance-lead";
import {
  type ContactByEmail,
  findContactsByEmails,
  HUBSPOT_ACCOUNT_ID,
  updateContact,
  upsertContact,
} from "@/server/clients/hubspot.client";
import { WANDER_PAGE_ID } from "@/server/clients/meta-leadgen.client";
import {
  escapeSlackMrkdwn,
  postOnSlack,
  type SlackBlock,
} from "@/server/clients/slack.client";
import { db } from "@/server/db";
import { metaLeadgenLeadTable } from "@/server/db/leads-schema";
import { performanceApplicationTable } from "@/server/db/performance-schema";
import {
  META_LEAD_NORMALIZATION_SYSTEM,
  metaLeadNormalizationSchema,
} from "./meta-lead-normalization.service";

// Verified active HubSpot owner and Slack member, 2026-10-22.
const JENNY_HUBSPOT_OWNER_ID = "101168977";
const JENNY_SLACK_ID = "U0C5NV73Z9B";
const KYLE_SLACK_ID = "U025DTBSU01";
/**
 * Every Performance beta application alert, qualified or not, posts to
 * #radio-performance so #team-performance keeps its signal (Kyle, 2026-10-22).
 * The application record and HubSpot contact are unchanged.
 */
export const PERFORMANCE_APPLICATIONS_CHANNEL = "C0CB9K4LM0T"; // #radio-performance

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

Performance beta qualification requires at least 10 currently managed properties (minimumUnits >= 10). Fewer than 10 or an unknown count is not qualified yet; use the conservative lower endpoint for ranges, so 1_9 does not qualify and 10_24 does. Only classify audience as guest when submitted answers clearly indicate a traveler looking to book a stay, rather than someone interested in marketing/property services; guest inquiries never qualify. A live website, existing Wander customer status, marketing spend, and other missing details are not qualification requirements. Write a short qualificationReason using only submitted facts and this rule. All applicants still go to Jenny for follow-up.`,
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
  // Small applications skip the live alert; the 5pm digest reads them back
  // from the Meta lead ledger. Test traffic and non-production deployments
  // still post to the testing channel.
  if (
    envSelect({ prod: !input.test, test: false }) &&
    !postsPerformanceAlertImmediately(lead.minimumUnits)
  ) {
    return contactId;
  }
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
    channel: input.test
      ? "radio-slack-testing"
      : PERFORMANCE_APPLICATIONS_CHANNEL,
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

// Slack caps a section at 3000 characters and a message at 50 blocks.
const DIGEST_SECTION_CHARS = 2800;
const DIGEST_SECTIONS_PER_MESSAGE = 45;

function mrkdwnSection(text: string): SlackBlock {
  return { type: "section", text: { type: "mrkdwn", text } };
}

type PerformanceDigestLead = {
  email: string;
  /** The applicant's own name on the website form; Meta leads use HubSpot's. */
  name: string | null;
  units: number | null;
  source: string;
  receivedAt: Date;
};

/**
 * Performance applications from the last `since` that the live alert held
 * back. Growth is the record for both senders: the website form writes
 * `performance_application` and the Meta/Zernio path stamps `routed_at` on
 * the lead ledger once HubSpot has the contact, so no new table or HubSpot
 * stamp is needed to find them again.
 */
async function findSmallPerformanceLeadsSince(
  since: Date,
): Promise<PerformanceDigestLead[]> {
  const [applications, metaLeads] = await Promise.all([
    db
      .select()
      .from(performanceApplicationTable)
      .where(
        and(
          gte(performanceApplicationTable.createdAt, since),
          or(
            isNull(performanceApplicationTable.propertyCount),
            lte(
              performanceApplicationTable.propertyCount,
              PERFORMANCE_DIGEST_MAX_UNITS,
            ),
          ),
        ),
      ),
    db
      .select()
      .from(metaLeadgenLeadTable)
      .where(
        and(
          eq(metaLeadgenLeadTable.pageId, WANDER_PAGE_ID),
          inArray(metaLeadgenLeadTable.formId, [...PERFORMANCE_META_FORM_IDS]),
          gte(metaLeadgenLeadTable.routedAt, since),
          or(
            isNull(metaLeadgenLeadTable.units),
            lte(metaLeadgenLeadTable.units, PERFORMANCE_DIGEST_MAX_UNITS),
          ),
        ),
      ),
  ]);
  return [
    ...applications.map((application) => ({
      email: application.email,
      name: application.name,
      units: application.propertyCount,
      source: application.source,
      receivedAt: application.createdAt,
    })),
    ...metaLeads.flatMap((lead) =>
      // Routing requires an email, so a routed lead without one is a ledger
      // inconsistency rather than an applicant to list.
      lead.email && lead.routedAt
        ? [
            {
              email: lead.email,
              name: null,
              units: lead.units,
              source: `Meta Lead Ad · ${lead.formName ?? lead.formId ?? "unknown form"}`,
              receivedAt: lead.routedAt,
            },
          ]
        : [],
    ),
  ].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
}

/**
 * Posts the last 24 hours of small Performance beta applications (5 or fewer
 * properties, or no count) to #radio-performance, one line per application.
 * Runs from `/api/cron/inbound-digest` alongside the WanderOS inbound digest.
 * HubSpot is read only to link the contact and name Meta applicants; when
 * that lookup fails the digest still posts, saying so, rather than going
 * missing for the day.
 */
export async function postPerformanceLeadDigest(): Promise<{
  posted: number;
}> {
  const leads = await findSmallPerformanceLeadsSince(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
  );
  if (leads.length === 0) return { posted: 0 };

  let contacts = new Map<string, ContactByEmail>();
  let lookupFailed = false;
  try {
    contacts = await findContactsByEmails(leads.map((lead) => lead.email));
  } catch (error) {
    lookupFailed = true;
    console.error("[performance-digest] HubSpot contact lookup failed", error);
  }

  const esc = escapeSlackMrkdwn;
  const sections: string[][] = [];
  for (const lead of leads) {
    const contact = contacts.get(lead.email.toLowerCase());
    const name =
      lead.name ??
      [contact?.firstName, contact?.lastName].filter(Boolean).join(" ");
    const line = [
      `• *${esc(name || lead.email)}*`,
      esc(lead.email),
      lead.units === null
        ? "properties unknown"
        : `${lead.units} ${lead.units === 1 ? "property" : "properties"}`,
      `from ${esc(lead.source)}`,
      contact
        ? `<https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/contact/${contact.id}|HubSpot>`
        : lookupFailed
          ? null
          : "not in HubSpot",
    ]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
    const last = sections.at(-1);
    if (
      last &&
      last.join("\n").length + line.length + 1 <= DIGEST_SECTION_CHARS
    ) {
      last.push(line);
    } else {
      sections.push([line]);
    }
  }

  const text = `🎯 *Today's smaller Performance beta applications (${PERFORMANCE_DIGEST_MAX_UNITS} properties or fewer): ${leads.length}*${lookupFailed ? "\n_HubSpot lookup failed; contact links omitted._" : ""}`;
  for (let i = 0; i < sections.length; i += DIGEST_SECTIONS_PER_MESSAGE) {
    const result = await postOnSlack({
      text,
      channel: PERFORMANCE_APPLICATIONS_CHANNEL,
      unfurl_links: false,
      unfurl_media: false,
      blocks: [
        ...(i === 0 ? [mrkdwnSection(text)] : []),
        ...sections
          .slice(i, i + DIGEST_SECTIONS_PER_MESSAGE)
          .map((lines) => mrkdwnSection(lines.join("\n"))),
      ],
    });
    if (!result.success) {
      throw new Error(`Performance digest Slack post failed: ${result.error}`);
    }
  }
  return { posted: leads.length };
}
