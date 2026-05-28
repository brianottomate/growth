// =====================================================
// INSTANTLY.AI API v2 TYPES
// =====================================================

// =====================================================
// LEADS
// =====================================================

/**
 * Lead status enum
 * @see https://developer.instantly.ai/api-reference/lead/get-lead
 */
export const LEAD_STATUS = {
  ACTIVE: 1,
  PAUSED: 2,
  COMPLETED: 3,
  BOUNCED: -1,
  UNSUBSCRIBED: -2,
  SKIPPED: -3,
} as const;

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

/**
 * Lead interest status enum
 */
export const LEAD_INTEREST_STATUS = {
  WON: 4,
  MEETING_COMPLETED: 3,
  MEETING_BOOKED: 2,
  INTERESTED: 1,
  NEUTRAL: 0,
  NOT_INTERESTED: -1,
  WRONG_PERSON: -2,
  OUT_OF_OFFICE: -3,
  LOST: -4,
} as const;

export type LeadInterestStatus =
  (typeof LEAD_INTEREST_STATUS)[keyof typeof LEAD_INTEREST_STATUS];

/**
 * Lead verification status
 */
export const VERIFICATION_STATUS = {
  VERIFIED: 1,
  INVALID: -1,
  RISKY: -2,
  CATCH_ALL: -3,
  UNKNOWN: -4,
  PENDING: 11,
  NOT_VERIFIED: 12,
} as const;

export type VerificationStatus =
  (typeof VERIFICATION_STATUS)[keyof typeof VERIFICATION_STATUS];

/**
 * Full lead object returned by the API
 */
export interface InstantlyLead {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  job_title: string | null;
  company_domain: string | null;
  phone: string | null;
  website: string | null;
  personalization: string | null;
  status: LeadStatus;
  lt_interest_status: LeadInterestStatus;
  verification_status: number | null;
  enrichment_status: number | null;
  campaign: string | null;
  list_id: string | null;
  organization: string | null;
  assigned_to: string | null;
  uploaded_by_user: string | null;
  upload_method: string | null;
  pl_value_lead: string | null;
  payload: Record<string, unknown> | null;
  custom_variables: Record<string, string | number | boolean | null> | null;

  // Engagement metrics (read-only)
  email_open_count: number;
  email_reply_count: number;
  email_click_count: number;
  email_opened_step: number | null;
  email_opened_variant: number | null;
  email_replied_step: number | null;
  email_replied_variant: number | null;
  email_clicked_step: number | null;
  email_clicked_variant: number | null;

  // Timestamps
  timestamp_created: string;
  timestamp_updated: string;
  timestamp_last_contact: string | null;
  timestamp_last_open: string | null;
  timestamp_last_reply: string | null;
  timestamp_last_click: string | null;
  timestamp_last_touch: string | null;
}

/**
 * Input for creating a single lead
 */
export interface CreateLeadInput {
  email?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  job_title?: string;
  phone?: string;
  website?: string;
  personalization?: string;
  lt_interest_status?: LeadInterestStatus;
  pl_value_lead?: string;
  assigned_to?: string;
  custom_variables?: Record<string, string | number | boolean | null>;
}

/**
 * Input for creating a lead (single)
 */
export interface CreateLeadRequest {
  campaign?: string;
  list_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  job_title?: string;
  phone?: string;
  website?: string;
  personalization?: string;
  lt_interest_status?: LeadInterestStatus;
  pl_value_lead?: string;
  assigned_to?: string;
  skip_if_in_workspace?: boolean;
  skip_if_in_campaign?: boolean;
  skip_if_in_list?: boolean;
  blocklist_id?: string;
  verify_leads_on_import?: boolean;
  custom_variables?: Record<string, string | number | boolean | null>;
}

/**
 * Input for bulk adding leads
 */
export interface BulkAddLeadsRequest {
  campaign_id?: string;
  list_id?: string;
  leads: CreateLeadInput[];
  blocklist_id?: string;
  assigned_to?: string;
  skip_if_in_workspace?: boolean;
  skip_if_in_campaign?: boolean;
  skip_if_in_list?: boolean;
  verify_leads_on_import?: boolean;
}

export interface BulkAddLeadsResponse {
  status: string;
  total_sent: number;
  leads_uploaded: number;
  in_blocklist: number;
  blocklist_used: string | null;
  duplicated_leads: number;
  skipped_count: number;
  invalid_email_count: number;
  incomplete_count: number;
  duplicate_email_count: number;
  remaining_in_plan: number | null;
  created_leads: Array<{
    index: number;
    id: string;
    email: string | null;
  }>;
}

/**
 * List leads request (POST /api/v2/leads/list)
 */
export interface ListLeadsRequest {
  search?: string;
  filter?: string;
  campaign?: string;
  list_id?: string;
  in_campaign?: boolean;
  in_list?: boolean;
  ids?: string[];
  excluded_ids?: string[];
  contacts?: string[];
  limit?: number;
  starting_after?: string;
  distinct_contacts?: boolean;
  enrichment_status?: number;
  esg_code?: string;
}

export interface ListLeadsResponse {
  items: InstantlyLead[];
  next_starting_after: string | null;
}

/**
 * Patch lead request
 */
export interface PatchLeadRequest {
  email?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  job_title?: string;
  phone?: string;
  website?: string;
  personalization?: string;
  lt_interest_status?: LeadInterestStatus;
  pl_value_lead?: string;
  assigned_to?: string | null;
  custom_variables?: Record<string, string | number | boolean | null>;
}

// =====================================================
// CAMPAIGNS
// =====================================================

/**
 * Campaign status enum
 */
export const CAMPAIGN_STATUS = {
  DRAFT: 0,
  ACTIVE: 1,
  PAUSED: 2,
  COMPLETED: 3,
  RUNNING_SUBSEQUENCES: 4,
  ACCOUNTS_UNHEALTHY: -1,
  BOUNCE_PROTECT: -2,
  SUSPENDED: -99,
} as const;

export type CampaignStatus =
  (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];

export interface InstantlyCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  pl_value: number | null;
  is_evergreen: boolean | null;
  campaign_schedule: Record<string, unknown> | null;
  sequences: unknown[];
  email_gap: number | null;
  random_wait_max: number | null;
  email_list: string[];
  daily_limit: number | null;
  link_tracking: boolean | null;
  open_tracking: boolean | null;
  stop_on_reply: boolean | null;
  stop_on_auto_reply: boolean | null;
  daily_max_leads: number | null;
  text_only: boolean | null;
  organization: string | null;
  owned_by: string | null;
  timestamp_created: string;
  timestamp_updated: string;
}

export interface ListCampaignsResponse {
  items: InstantlyCampaign[];
  next_starting_after: string | null;
}

export interface CampaignAnalytics {
  campaign_name: string;
  campaign_id: string;
  campaign_status: CampaignStatus;
  campaign_is_evergreen: boolean | null;
  leads_count: number;
  contacted_count: number;
  new_leads_contacted_count: number;
  completed_count: number;
  emails_sent_count: number;
  open_count: number;
  open_count_unique: number;
  reply_count: number;
  reply_count_unique: number;
  bounced_count: number;
  unsubscribed_count: number;
  link_click_count: number;
  link_click_count_unique: number;
  link_click_count_unique_by_step?: number;
  open_count_unique_by_step?: number;
  reply_count_unique_by_step?: number;
  reply_count_automatic?: number;
  reply_count_automatic_unique?: number;
  reply_count_automatic_unique_by_step?: number;
  total_opportunities: number;
  total_opportunity_value: number;
  total_interested?: number;
  total_meeting_booked?: number;
  total_meeting_completed?: number;
  total_closed?: number;
}

// =====================================================
// WEBHOOKS
// =====================================================

export const WEBHOOK_EVENT_TYPES = [
  "all_events",
  "email_sent",
  "email_opened",
  "email_link_clicked",
  "reply_received",
  "email_bounced",
  "lead_unsubscribed",
  "campaign_completed",
  "account_error",
  "lead_neutral",
  "lead_interested",
  "lead_not_interested",
  "lead_meeting_booked",
  "lead_meeting_completed",
  "lead_closed",
  "lead_out_of_office",
  "lead_wrong_person",
  "lead_no_show",
  "supersearch_enrichment_completed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface InstantlyWebhook {
  id: string;
  organization: string;
  campaign: string | null;
  name: string | null;
  target_hook_url: string;
  event_type: WebhookEventType;
  custom_interest_value: number | null;
  headers: Record<string, string> | null;
  status: number;
  timestamp_created: string;
  timestamp_error: string | null;
}

export interface WebhookPayload {
  timestamp: string;
  event_type: WebhookEventType;
  workspace: string;
  campaign_id: string | null;
  campaign_name: string | null;
  lead_email: string | null;
  email_account: string | null;
  unibox_url: string | null;
  // Email-specific
  email_id: string | null;
  email_subject: string | null;
  email_text: string | null;
  email_html: string | null;
  // Reply-specific
  reply_text_snippet: string | null;
  reply_subject: string | null;
  reply_text: string | null;
  reply_html: string | null;
  // Lead custom data gets merged in
  [key: string]: unknown;
}

// =====================================================
// LEAD LISTS
// =====================================================

export interface InstantlyLeadList {
  id: string;
  organization_id: string;
  name: string;
  timestamp_created: string;
  has_enrichment_task: boolean;
  owned_by: string;
}

export interface ListLeadListsResponse {
  items: InstantlyLeadList[];
  next_starting_after: string | null;
}

// =====================================================
// ACCOUNTS
// =====================================================

export interface InstantlyAccount {
  email: string;
  first_name: string | null;
  last_name: string | null;
  organization: string;
  status: number;
  warmup_status: number | null;
  provider_code: number | null;
  setup_pending: boolean | null;
  is_managed_account: boolean | null;
  daily_limit: number | null;
  tracking_domain_name: string | null;
  tracking_domain_status: string | null;
  timestamp_last_used: string | null;
  timestamp_created: string;
  timestamp_updated: string;
  tags?: Array<{
    id: string;
    label: string;
    description: string | null;
  }>;
}

export interface ListAccountsResponse {
  items: InstantlyAccount[];
  next_starting_after: string | null;
}

export interface UpdateLeadInterestStatusRequest {
  lead_email: string;
  interest_value: number | null;
  campaign_id?: string;
  ai_interest_value?: number;
  disable_auto_interest?: boolean;
  list_id?: string;
}

export interface UpdateLeadInterestStatusResponse {
  message: string;
}

export interface EmailVerificationResponse {
  email: string;
  verification_status: "pending" | "verified" | "invalid";
  status: "success" | "error" | null;
  catch_all?: boolean | string | null;
  credits?: number | null;
  credits_used?: number | null;
}
