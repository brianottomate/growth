import { NextResponse } from "next/server";
import {
  isInstantlyConfigured,
  testConnection,
  listCampaigns,
  listLeads,
  listLeadLists,
  listAccounts,
  listWebhooks,
  getCampaignAnalytics,
} from "@/server/clients/instantly.client";
import type {
  CampaignAnalytics,
  InstantlyCampaign,
  InstantlyLead,
} from "@/server/clients/instantly.types";
import { assertLabAccess } from "@/server/lab-access";

/**
 * Test Instantly API connection and show workspace overview.
 *
 * GET /api/instantly/test
 */
export async function GET(request: Request) {
  const denied = await assertLabAccess(request);
  if (denied) return denied;
  if (!isInstantlyConfigured) {
    return NextResponse.json(
      {
        success: false,
        error: "Instantly is not configured. Set INSTANTLY_API_KEY.",
      },
      { status: 500 },
    );
  }

  const connection = await testConnection();
  if (!connection.success) {
    return NextResponse.json(
      { success: false, error: connection.message },
      { status: 500 },
    );
  }

  const [
    campaignsResult,
    leadListsResult,
    globalLeadsResult,
    accountsResult,
    webhooksResult,
    analyticsResult,
  ] = await Promise.all([
    capture("campaigns", () => listCampaigns({ limit: 10 })),
    capture("leadLists", () => listLeadLists({ limit: 10 })),
    capture("globalLeads", () => listLeads({ limit: 10 })),
    capture("accounts", () => listAccounts({ limit: 10 })),
    capture("webhooks", () => listWebhooks()),
    capture("analytics", () =>
      getCampaignAnalytics({ exclude_total_leads_count: true }),
    ),
  ]);

  const campaigns = campaignsResult.ok ? campaignsResult.data.items : [];

  const campaignLeadResults = await Promise.all(
    campaigns.map((campaign) =>
      capture(`campaign:${campaign.id}:leads`, () =>
        listLeads({ campaign: campaign.id, limit: 10 }),
      ).then((result) => ({ campaign, result })),
    ),
  );

  return NextResponse.json({
    success: true,
    message: connection.message,
    workspace: {
      campaigns: summarizeCollection(campaignsResult, summarizeCampaign),
      leadLists: summarizeCollection(leadListsResult, (leadList) => ({
        id: leadList.id,
        name: leadList.name,
        has_enrichment_task: leadList.has_enrichment_task,
        owned_by: leadList.owned_by,
      })),
      accounts: summarizeCollection(accountsResult, (account) => ({
        email: maskEmail(account.email),
        status: account.status,
        warmup_status: account.warmup_status,
        provider_code: account.provider_code,
        tracking_domain_status: account.tracking_domain_status,
      })),
      webhooks: summarizeCollection(webhooksResult, (webhook) => ({
        id: webhook.id,
        name: webhook.name,
        event_type: webhook.event_type,
        campaign: webhook.campaign,
        status: webhook.status,
      })),
    },
    leads: {
      note: "Lead lists can be empty even when campaign-scoped leads exist. Campaign lead checks use POST /api/v2/leads/list with campaign filters.",
      global: summarizeCollection(globalLeadsResult, summarizeLead),
      byCampaign: campaignLeadResults.map(({ campaign, result }) => ({
        campaign: summarizeCampaign(campaign),
        ...summarizeCollection(result, summarizeLead),
      })),
    },
    analytics: summarizeAnalytics(analyticsResult),
  });
}

async function capture<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<
  | { ok: true; label: string; data: T }
  | { ok: false; label: string; error: string }
> {
  try {
    return { ok: true, label, data: await fn() };
  } catch (error) {
    return { ok: false, label, error: errorMessage(error) };
  }
}

function summarizeCollection<T>(
  result:
    | { ok: true; data: { items: T[]; next_starting_after: string | null } }
    | { ok: false; error: string },
  mapItem: (item: T) => unknown,
) {
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    returned: result.data.items.length,
    hasMore: Boolean(result.data.next_starting_after),
    items: result.data.items.map(mapItem),
  };
}

function summarizeCampaign(campaign: InstantlyCampaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    timestamp_created: campaign.timestamp_created,
  };
}

function summarizeLead(lead: InstantlyLead) {
  return {
    id: lead.id,
    email: maskEmail(lead.email),
    campaign: lead.campaign,
    list_id: lead.list_id,
    status: lead.status,
    lt_interest_status: lead.lt_interest_status,
    verification_status: lead.verification_status,
    payloadKeys: Object.keys(lead.payload ?? {}),
    customVariableKeys: Object.keys(lead.custom_variables ?? {}),
    timestamp_created: lead.timestamp_created,
    timestamp_updated: lead.timestamp_updated,
  };
}

function summarizeAnalytics(
  result:
    | { ok: true; data: CampaignAnalytics[] }
    | { ok: false; error: string },
) {
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    returned: result.data.length,
    campaigns: result.data.map((campaign) => ({
      campaign_id: campaign.campaign_id,
      campaign_name: campaign.campaign_name,
      campaign_status: campaign.campaign_status,
      leads_count: campaign.leads_count,
      contacted_count: campaign.contacted_count,
      emails_sent_count: campaign.emails_sent_count,
      reply_count: campaign.reply_count,
      total_opportunities: campaign.total_opportunities,
    })),
  };
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [name, domain] = email.split("@");
  if (!name || !domain) return "***";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}***@${domain}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
