import "server-only";

import { env } from "@/env";
import { parseMetaLead, type MetaLead } from "@/lib/meta-leadgen";

const GRAPH = "https://graph.facebook.com/v23.0";

/** Page "Wander", where every WanderOS lead form lives. */
export const WANDER_PAGE_ID = "101399685529192";
/** "Wander Pixel - Segment", dataset the lead-ads ad sets optimize on. */
export const WANDER_PIXEL_ID = "340252052212435";

export const isMetaLeadgenConfigured = Boolean(env.META_LEADS_ACCESS_TOKEN);

export type { MetaLead };

export interface MetaLeadForm {
  id: string;
  name: string;
  status: string;
}

const LEAD_FIELDS =
  "id,created_time,form_id,ad_id,ad_name,adset_name,campaign_id,campaign_name,is_organic,field_data";

async function graph<T>(
  path: string,
  params: Record<string, string>,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith("https://")
    ? new URL(path)
    : new URL(`${GRAPH}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, init);
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || json.error) {
    throw new Error(
      `[meta-leadgen] ${path.split("?")[0]} → ${res.status} ${json.error?.message ?? ""}`,
    );
  }
  return json;
}

function systemToken(): string {
  if (!env.META_LEADS_ACCESS_TOKEN) {
    throw new Error("META_LEADS_ACCESS_TOKEN is not configured");
  }
  return env.META_LEADS_ACCESS_TOKEN;
}

/** Form listing and lead reads need a Page token; the system user mints one. */
export async function fetchPageAccessToken(): Promise<string> {
  const page = await graph<{ access_token?: string }>(WANDER_PAGE_ID, {
    fields: "access_token",
    access_token: systemToken(),
  });
  if (!page.access_token) {
    throw new Error("[meta-leadgen] system user has no token for the Page");
  }
  return page.access_token;
}

export async function fetchLead(
  leadgenId: string,
  pageToken: string,
): Promise<MetaLead> {
  return parseMetaLead(
    await graph<unknown>(leadgenId, {
      fields: LEAD_FIELDS,
      access_token: pageToken,
    }),
  );
}

export async function fetchFormName(
  formId: string,
  pageToken: string,
): Promise<string | null> {
  const form = await graph<{ name?: string }>(formId, {
    fields: "name",
    access_token: pageToken,
  });
  return form.name ?? null;
}

export async function listActiveLeadForms(
  pageToken: string,
): Promise<MetaLeadForm[]> {
  const forms: MetaLeadForm[] = [];
  let next: string | undefined = `${WANDER_PAGE_ID}/leadgen_forms`;
  let params: Record<string, string> = {
    fields: "id,name,status",
    limit: "100",
    access_token: pageToken,
  };
  while (next) {
    const page: { data: MetaLeadForm[]; paging?: { next?: string } } =
      await graph(next, params);
    forms.push(...page.data);
    next = page.paging?.next;
    params = {};
  }
  return forms.filter((form) => form.status === "ACTIVE");
}

export async function listFormLeadsSince(
  formId: string,
  sinceUnix: number,
  pageToken: string,
): Promise<MetaLead[]> {
  const leads: MetaLead[] = [];
  let next: string | undefined = `${formId}/leads`;
  let params: Record<string, string> = {
    fields: LEAD_FIELDS,
    limit: "200",
    filtering: JSON.stringify([
      { field: "time_created", operator: "GREATER_THAN", value: sinceUnix },
    ]),
    access_token: pageToken,
  };
  while (next) {
    const page: { data: unknown[]; paging?: { next?: string } } = await graph(
      next,
      params,
    );
    leads.push(
      ...page.data.map((lead) => ({ form_id: formId, ...parseMetaLead(lead) })),
    );
    next = page.paging?.next;
    params = {};
  }
  return leads;
}

const LEAD_ID_SLOT = "__lead_id__";

/**
 * Conversions API for CRM: a lead-stage event keyed on Meta's lead id, which
 * is what "Maximize number of qualified leads" ad sets optimize on. `event_id`
 * lets Meta drop a resend after a crash between send and stamp.
 */
export async function sendQualifiedLeadEvent({
  leadgenId,
  eventName,
  testEventCode,
}: {
  leadgenId: string;
  eventName: string;
  /** Events Manager "Test events" code; the event shows there and is not counted. */
  testEventCode?: string;
}): Promise<void> {
  if (!/^\d+$/.test(leadgenId)) {
    throw new Error(`[meta-leadgen] not a lead id: ${leadgenId}`);
  }
  const body = JSON.stringify({
    access_token: systemToken(),
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: `${eventName}:${leadgenId}`,
        action_source: "system_generated",
        user_data: { lead_id: LEAD_ID_SLOT },
        custom_data: {
          event_source: "crm",
          lead_event_source: "Wander Growth",
        },
      },
    ],
    ...(testEventCode && { test_event_code: testEventCode }),
  });
  await graph(
    `${WANDER_PIXEL_ID}/events`,
    {},
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Meta wants lead_id as a number; splice the digits in so ids past
      // 2^53 keep their precision.
      body: body.replace(JSON.stringify(LEAD_ID_SLOT), leadgenId),
    },
  );
}
