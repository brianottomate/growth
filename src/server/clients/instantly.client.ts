import "server-only";
import { env } from "@/env";
import type {
  InstantlyLead,
  ListLeadsRequest,
  ListLeadsResponse,
  CreateLeadRequest,
  BulkAddLeadsRequest,
  BulkAddLeadsResponse,
  PatchLeadRequest,
  InstantlyCampaign,
  ListCampaignsResponse,
  CampaignAnalytics,
  InstantlyWebhook,
  WebhookEventType,
  ListLeadListsResponse,
  ListAccountsResponse,
  UpdateLeadInterestStatusRequest,
  UpdateLeadInterestStatusResponse,
  EmailVerificationResponse,
  CreateCampaignRequest,
  InstantlyEmail,
  ListEmailsRequest,
  ListEmailsResponse,
  ReplyToEmailRequest,
  UnreadCountResponse,
} from "./instantly.types";

// =====================================================
// INSTANTLY.AI CLIENT
// =====================================================

/**
 * Instantly.ai API v2 Client
 *
 * Cold email outreach platform used for lead management, campaigns,
 * and AI-enriched lead scoring workflows.
 *
 * Authentication: Bearer token via API key
 * Base URL: https://api.instantly.ai/api/v2
 * Rate limits: 100 req/s, 6000 req/min (workspace-wide)
 *
 * Required Environment Variables:
 * - INSTANTLY_API_KEY: API key with appropriate scopes
 */

// =====================================================
// CLIENT INITIALIZATION
// =====================================================

export const isInstantlyConfigured = !!env.INSTANTLY_API_KEY;

if (!isInstantlyConfigured) {
  console.warn(
    "⚠️ [Instantly] Not configured. Set INSTANTLY_API_KEY to enable.",
  );
}

// =====================================================
// CONSTANTS
// =====================================================

const INSTANTLY_API_BASE = "https://api.instantly.ai/api/v2";

// =====================================================
// ERROR HANDLING
// =====================================================

export class InstantlyError extends Error {
  public readonly statusCode?: number;
  public readonly isRateLimited: boolean;
  public readonly retryAfter?: number;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      isRateLimited?: boolean;
      retryAfter?: number;
    },
  ) {
    super(message);
    this.name = "InstantlyError";
    this.statusCode = options?.statusCode;
    this.isRateLimited = options?.isRateLimited ?? false;
    this.retryAfter = options?.retryAfter;
  }
}

export function isInstantlyError(error: unknown): error is InstantlyError {
  return error instanceof InstantlyError;
}

// =====================================================
// API HELPERS
// =====================================================

function getAuthHeaders(): Record<string, string> {
  if (!env.INSTANTLY_API_KEY) {
    throw new InstantlyError("INSTANTLY_API_KEY is not configured");
  }

  return {
    Authorization: `Bearer ${env.INSTANTLY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

/**
 * Make an authenticated request to the Instantly API
 */
async function instantlyRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  if (!isInstantlyConfigured) {
    throw new InstantlyError("Instantly is not configured");
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${INSTANTLY_API_BASE}${endpoint}`;

  const mergedHeaders: Record<string, string> = {
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> | undefined),
  };
  // Instantly (Fastify) rejects requests that declare a JSON content-type but
  // send no body (e.g. DELETE) — drop the header when there's nothing to send.
  if (options.body == null) {
    delete mergedHeaders["Content-Type"];
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: mergedHeaders,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ [Instantly] Request failed: ${response.status} ${options.method ?? "GET"} ${endpoint}`,
        errorText,
      );

      if (response.status === 429) {
        throw new InstantlyError("Rate limited", {
          statusCode: 429,
          isRateLimited: true,
        });
      }

      throw new InstantlyError(
        `API request failed: ${response.status} ${response.statusText}`,
        { statusCode: response.status },
      );
    }

    // Some endpoints (DELETE) may return 204 with no body
    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof InstantlyError) {
      throw error;
    }
    console.error("❌ [Instantly] Request error:", error);
    throw new InstantlyError(
      `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// =====================================================
// CONNECTION TEST
// =====================================================

export async function testConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  if (!isInstantlyConfigured) {
    return { success: false, message: "Instantly is not configured" };
  }

  try {
    await instantlyRequest<ListCampaignsResponse>("/campaigns?limit=1");
    return {
      success: true,
      message: "Successfully connected to Instantly API",
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof InstantlyError
          ? error.message
          : "Unknown connection error",
    };
  }
}

// =====================================================
// LEADS
// =====================================================

/**
 * List leads with filtering and cursor-based pagination.
 *
 * Note: This is a POST endpoint (Instantly deviates from REST here).
 */
export async function listLeads(
  params?: ListLeadsRequest,
): Promise<ListLeadsResponse> {
  return instantlyRequest<ListLeadsResponse>("/leads/list", {
    method: "POST",
    body: JSON.stringify({
      limit: params?.limit ?? 100,
      ...params,
    }),
  });
}

/**
 * Paginate through all leads matching a filter.
 *
 * Yields pages of leads. Use `for await` to iterate:
 * ```ts
 * for await (const page of paginateLeads({ campaign: "..." })) {
 *   for (const lead of page.items) { ... }
 * }
 * ```
 */
export async function* paginateLeads(
  params?: Omit<ListLeadsRequest, "starting_after">,
  options?: { maxPages?: number },
): AsyncGenerator<ListLeadsResponse> {
  const maxPages = options?.maxPages ?? 100;
  let cursor: string | null | undefined = undefined;

  for (let page = 0; page < maxPages; page++) {
    const response = await listLeads({
      ...params,
      limit: params?.limit ?? 100,
      ...(cursor ? { starting_after: cursor } : {}),
    });

    yield response;

    if (!response.next_starting_after || response.items.length === 0) {
      break;
    }
    cursor = response.next_starting_after;
  }
}

/**
 * Get a single lead by ID.
 */
export async function getLead(id: string): Promise<InstantlyLead | null> {
  try {
    return await instantlyRequest<InstantlyLead>(`/leads/${id}`);
  } catch (error) {
    if (error instanceof InstantlyError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Create a single lead.
 */
export async function createLead(
  params: CreateLeadRequest,
): Promise<InstantlyLead> {
  return instantlyRequest<InstantlyLead>("/leads", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Add up to 1000 leads in bulk to a campaign or list.
 */
export async function addLeadsBulk(
  params: BulkAddLeadsRequest,
): Promise<BulkAddLeadsResponse> {
  if (params.leads.length > 1000) {
    throw new InstantlyError("Bulk add supports max 1000 leads per request");
  }
  return instantlyRequest<BulkAddLeadsResponse>("/leads/add", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Update a lead by ID.
 *
 * Use this to write back AI scores and enrichment data via custom_variables.
 */
export async function patchLead(
  id: string,
  params: PatchLeadRequest,
): Promise<InstantlyLead> {
  return instantlyRequest<InstantlyLead>(`/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(params),
  });
}

/**
 * Delete a lead by ID.
 */
export async function deleteLead(id: string): Promise<InstantlyLead> {
  return instantlyRequest<InstantlyLead>(`/leads/${id}`, { method: "DELETE" });
}

/**
 * Update interest status of a lead.
 *
 * Instantly accepts lead identity by email rather than by lead ID here and
 * submits the update as a background job.
 */
export async function updateLeadInterestStatus(
  params: UpdateLeadInterestStatusRequest,
): Promise<UpdateLeadInterestStatusResponse> {
  return instantlyRequest<UpdateLeadInterestStatusResponse>(
    "/leads/update-interest-status",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

/**
 * Backward-compatible helper for callers that only have email + status.
 */
export async function updateLeadInterestStatusByEmail(
  leadEmail: string,
  interestStatus: UpdateLeadInterestStatusRequest["interest_value"],
): Promise<UpdateLeadInterestStatusResponse> {
  return updateLeadInterestStatus({
    lead_email: leadEmail,
    interest_value: interestStatus,
  });
}

/**
 * @deprecated Instantly's current API updates interest by lead email, not ID.
 */
export async function updateLeadInterestStatusById(
  _id: string,
  _interestStatus: number,
): Promise<never> {
  throw new InstantlyError(
    "Instantly updates lead interest status by lead_email via /leads/update-interest-status",
  );
}

/**
 * Create an email verification job.
 */
export async function createEmailVerification(params: {
  email: string;
  webhook_url?: string;
}): Promise<EmailVerificationResponse> {
  return instantlyRequest<EmailVerificationResponse>("/email-verification", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// =====================================================
// CAMPAIGNS
// =====================================================

/**
 * List campaigns with optional filtering.
 */
export async function listCampaigns(params?: {
  limit?: number;
  starting_after?: string;
  search?: string;
  status?: number;
  tag_ids?: string;
}): Promise<ListCampaignsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.starting_after)
    searchParams.set("starting_after", params.starting_after);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.status !== undefined)
    searchParams.set("status", String(params.status));
  if (params?.tag_ids) searchParams.set("tag_ids", params.tag_ids);

  const qs = searchParams.toString();
  return instantlyRequest<ListCampaignsResponse>(
    `/campaigns${qs ? `?${qs}` : ""}`,
  );
}

/**
 * Create a campaign (starts as DRAFT — does not send until launched).
 *
 * `sequences` accepts an array but Instantly only uses the first element, so
 * put all steps in `sequences[0].steps`. Each step's `delay` is the number of
 * days to wait AFTER that step before the next one fires.
 */
export async function createCampaign(
  params: CreateCampaignRequest,
): Promise<InstantlyCampaign> {
  return instantlyRequest<InstantlyCampaign>("/campaigns", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Delete a campaign by ID.
 */
export async function deleteCampaign(id: string): Promise<void> {
  await instantlyRequest<void>(`/campaigns/${id}`, { method: "DELETE" });
}

/**
 * Get a single campaign by ID.
 */
export async function getCampaign(
  id: string,
): Promise<InstantlyCampaign | null> {
  try {
    return await instantlyRequest<InstantlyCampaign>(`/campaigns/${id}`);
  } catch (error) {
    if (error instanceof InstantlyError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get analytics for one or all campaigns.
 */
export async function getCampaignAnalytics(params?: {
  id?: string;
  ids?: string[];
  start_date?: string;
  end_date?: string;
  exclude_total_leads_count?: boolean;
}): Promise<CampaignAnalytics[]> {
  const searchParams = new URLSearchParams();

  if (params?.id) searchParams.set("id", params.id);
  if (params?.ids) {
    for (const id of params.ids) {
      searchParams.append("ids", id);
    }
  }
  if (params?.start_date) searchParams.set("start_date", params.start_date);
  if (params?.end_date) searchParams.set("end_date", params.end_date);
  if (params?.exclude_total_leads_count !== undefined) {
    searchParams.set(
      "exclude_total_leads_count",
      String(params.exclude_total_leads_count),
    );
  }

  const qs = searchParams.toString();
  return instantlyRequest<CampaignAnalytics[]>(
    `/campaigns/analytics${qs ? `?${qs}` : ""}`,
  );
}

// =====================================================
// LEAD LISTS
// =====================================================

/**
 * List all lead lists.
 */
export async function listLeadLists(params?: {
  limit?: number;
  starting_after?: string;
  has_enrichment_task?: boolean;
  search?: string;
}): Promise<ListLeadListsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.starting_after)
    searchParams.set("starting_after", params.starting_after);
  if (params?.has_enrichment_task !== undefined) {
    searchParams.set("has_enrichment_task", String(params.has_enrichment_task));
  }
  if (params?.search) searchParams.set("search", params.search);

  const qs = searchParams.toString();
  return instantlyRequest<ListLeadListsResponse>(
    `/lead-lists${qs ? `?${qs}` : ""}`,
  );
}

// =====================================================
// ACCOUNTS
// =====================================================

/**
 * List email accounts.
 */
export async function listAccounts(params?: {
  limit?: number;
  starting_after?: string;
  search?: string;
  status?: number;
  provider_code?: number;
  tag_ids?: string;
  tag_ids_all?: string;
  include_tags?: boolean;
  filter?: string;
}): Promise<ListAccountsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.starting_after)
    searchParams.set("starting_after", params.starting_after);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.status !== undefined)
    searchParams.set("status", String(params.status));
  if (params?.provider_code !== undefined) {
    searchParams.set("provider_code", String(params.provider_code));
  }
  if (params?.tag_ids) searchParams.set("tag_ids", params.tag_ids);
  if (params?.tag_ids_all) searchParams.set("tag_ids_all", params.tag_ids_all);
  if (params?.include_tags !== undefined) {
    searchParams.set("include_tags", String(params.include_tags));
  }
  if (params?.filter) searchParams.set("filter", params.filter);

  const qs = searchParams.toString();
  return instantlyRequest<ListAccountsResponse>(
    `/accounts${qs ? `?${qs}` : ""}`,
  );
}

// =====================================================
// EMAILS / UNIBOX
// =====================================================

/**
 * List emails (the Unibox). Pass `preview_only: false` to include the full
 * body (text + html). Note: this endpoint is rate-limited to 20 req/min.
 */
export async function listEmails(
  params?: ListEmailsRequest,
): Promise<ListEmailsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.starting_after) sp.set("starting_after", params.starting_after);
  if (params?.campaign_id) sp.set("campaign_id", params.campaign_id);
  if (params?.eaccount) sp.set("eaccount", params.eaccount);
  if (params?.email_type) sp.set("email_type", params.email_type);
  if (params?.preview_only !== undefined)
    sp.set("preview_only", String(params.preview_only));
  if (params?.lead) sp.set("lead", params.lead);
  if (params?.latest_of_thread !== undefined)
    sp.set("latest_of_thread", String(params.latest_of_thread));
  const qs = sp.toString();
  return instantlyRequest<ListEmailsResponse>(`/emails${qs ? `?${qs}` : ""}`);
}

/**
 * Get a single email (with full body) by ID.
 */
export async function getEmail(id: string): Promise<InstantlyEmail | null> {
  try {
    return await instantlyRequest<InstantlyEmail>(`/emails/${id}`);
  } catch (error) {
    if (error instanceof InstantlyError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Count unread emails in the Unibox.
 */
export async function getUnreadCount(): Promise<UnreadCountResponse> {
  return instantlyRequest<UnreadCountResponse>("/emails/unread/count");
}

/**
 * Reply to an email (sends from `eaccount`). Use to answer a prospect's reply
 * — or to route the conversation to a real person via `assigned_to`.
 */
export async function replyToEmail(
  params: ReplyToEmailRequest,
): Promise<InstantlyEmail> {
  return instantlyRequest<InstantlyEmail>("/emails/reply", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Convenience: pull all received replies for a campaign, WITH full body text.
 * This is the path to surfacing replies in-app / routing them to a real person.
 */
export async function getCampaignReplies(
  campaignId: string,
  opts?: { maxPages?: number },
): Promise<InstantlyEmail[]> {
  const out: InstantlyEmail[] = [];
  let cursor: string | undefined;
  const maxPages = opts?.maxPages ?? 20;
  for (let p = 0; p < maxPages; p++) {
    const res = await listEmails({
      campaign_id: campaignId,
      email_type: "received",
      preview_only: false,
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    });
    out.push(...res.items);
    if (!res.next_starting_after || res.items.length === 0) break;
    cursor = res.next_starting_after;
  }
  return out;
}

// =====================================================
// WEBHOOKS
// =====================================================

/**
 * Create a webhook subscription.
 */
export async function createWebhook(params: {
  target_hook_url: string;
  event_type?: WebhookEventType | null;
  campaign?: string | null;
  name?: string | null;
  custom_interest_value?: number | null;
  headers?: Record<string, string>;
}): Promise<InstantlyWebhook> {
  return instantlyRequest<InstantlyWebhook>("/webhooks", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * List all webhooks.
 */
export async function listWebhooks(): Promise<{
  items: InstantlyWebhook[];
  next_starting_after: string | null;
}> {
  return instantlyRequest("/webhooks");
}

/**
 * Delete a webhook by ID.
 */
export async function deleteWebhook(id: string): Promise<void> {
  await instantlyRequest<void>(`/webhooks/${id}`, { method: "DELETE" });
}

// =====================================================
// EMAIL VERIFICATION
// =====================================================

/**
 * Verify a single email address.
 *
 * May return status "pending" if verification takes >10s.
 * Poll GET /email-verification/:email for final result.
 */
export async function verifyEmail(
  email: string,
): Promise<EmailVerificationResponse> {
  return createEmailVerification({ email });
}

/**
 * Check email verification status.
 */
export async function checkEmailVerification(
  email: string,
): Promise<EmailVerificationResponse> {
  return instantlyRequest<EmailVerificationResponse>(
    `/email-verification/${encodeURIComponent(email)}`,
  );
}
