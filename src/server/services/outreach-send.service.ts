import "server-only";
import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { leadOutreachTable } from "@/server/db/leads-schema";
import {
  activateCampaign,
  addLeadsBulk,
  createCampaign,
  listCampaigns,
} from "@/server/clients/instantly.client";

/**
 * Headless Instantly send — we treat Instantly as a dumb send API and keep the
 * brain (personalization, state) in our leads domain.
 *
 * Instead of one campaign per lead (sprawl), there's ONE shared "personalized"
 * campaign whose step bodies are custom-variable placeholders ({{subject}},
 * {{body1..4}}). Each lead carries its own fully-written body in those vars, so
 * every recipient gets a bespoke sequence from a single campaign. (Verified:
 * Instantly custom variables hold a full multi-paragraph body.)
 *
 * SAFETY: the shared campaign is created as DRAFT and this service never
 * activates it. Queuing a lead stages it; nothing sends until the campaign is
 * explicitly launched. Cadence is fixed at the campaign level (days 0/2/5/9);
 * only the content varies per lead.
 */

const MAILBOX = "emily@trywanderos.com";
const CAMPAIGN_NAME = "WanderOS Personalized (headless)";
const STEP_COUNT = 4;
// `delay` = days to wait AFTER each step → arrivals on days 0, 2, 5, 9.
const STEP_DELAYS = [2, 3, 4, 0];

const fmt = (d: Date) => d.toISOString().slice(0, 10);

async function ensurePersonalizedCampaign(): Promise<string> {
  const existing = await listCampaigns({ search: CAMPAIGN_NAME, limit: 10 });
  const found = existing.items.find((c) => c.name === CAMPAIGN_NAME);
  if (found) return found.id;

  const today = new Date();
  const schedule = {
    start_date: fmt(today),
    end_date: fmt(new Date(today.getTime() + 60 * 86_400_000)),
    schedules: [
      {
        name: "Always on",
        timing: { from: "09:00", to: "17:00" },
        days: { "0": false, "1": true, "2": true, "3": true, "4": true, "5": true, "6": false },
        timezone: "America/Detroit",
      },
    ],
  };
  const steps = Array.from({ length: STEP_COUNT }, (_, i) => ({
    type: "email" as const,
    delay: STEP_DELAYS[i] ?? 0,
    delay_unit: "days" as const,
    // step 1 has a subject; follow-ups reply in-thread (empty subject)
    variants: [{ subject: i === 0 ? "{{subject}}" : "", body: `{{body${i + 1}}}` }],
  }));

  const c = await createCampaign({
    name: CAMPAIGN_NAME,
    campaign_schedule: schedule,
    sequences: [{ steps }],
    email_list: [MAILBOX],
    daily_limit: 50,
    link_tracking: false, // keep clean UTMs + deliverability
    open_tracking: true, // we still want opens
    stop_on_reply: true,
    stop_on_auto_reply: true,
    text_only: true,
  });
  return c.id;
}

export type QueueResult = {
  campaignId: string;
  leadId: string | null;
  recipient: string;
};

/**
 * Push a lead's latest draft into the shared personalized campaign as custom
 * variables, and mark the outreach row queued. Does NOT activate the campaign.
 */
export async function queueOutreach(
  domainId: string,
  recipientEmail: string,
): Promise<QueueResult> {
  const [row] = await db
    .select()
    .from(leadOutreachTable)
    .where(eq(leadOutreachTable.domainId, domainId))
    .orderBy(desc(leadOutreachTable.createdAt))
    .limit(1);
  if (!row?.steps?.length) throw new Error("No outreach draft to queue for this domain");

  const campaignId = await ensurePersonalizedCampaign();

  const steps = row.steps;
  const custom_variables: Record<string, string> = {
    subject: steps[0]?.subject ?? "Quick question",
  };
  for (let i = 0; i < STEP_COUNT; i++) {
    custom_variables[`body${i + 1}`] = steps[i]?.body ?? "";
  }

  const res = await addLeadsBulk({
    campaign_id: campaignId,
    leads: [{ email: recipientEmail, custom_variables }],
    skip_if_in_campaign: true,
    verify_leads_on_import: true,
  });
  const leadId = res.created_leads?.[0]?.id ?? null;

  await db
    .update(leadOutreachTable)
    .set({ status: "queued", instantlyCampaignId: campaignId, instantlyLeadId: leadId })
    .where(eq(leadOutreachTable.id, row.id));

  return { campaignId, leadId, recipient: recipientEmail };
}

/**
 * Activate the shared personalized campaign — everyone currently queued in it
 * starts sending per the schedule. Campaign-level action (not per lead).
 */
export async function launchPersonalizedCampaign(): Promise<{
  campaignId: string;
}> {
  const existing = await listCampaigns({ search: CAMPAIGN_NAME, limit: 10 });
  const found = existing.items.find((c) => c.name === CAMPAIGN_NAME);
  if (!found) {
    throw new Error("Personalized campaign doesn't exist yet — queue a lead first");
  }
  await activateCampaign(found.id);
  return { campaignId: found.id };
}
