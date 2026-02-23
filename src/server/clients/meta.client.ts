import "server-only";
import { env } from "@/env";

const META_API_VERSION = "v18.0";
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// =====================================================
// TYPES
// =====================================================

interface MetaAction {
  action_type: string;
  value?: string;
  "1d_view"?: string;
  "28d_click"?: string;
}

interface MetaInsightsRecord {
  date_start: string;
  date_stop: string;
  account_id: string;
  account_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}

interface MetaInsightsPageResponse {
  data?: MetaInsightsRecord[];
  error?: { message: string; code: number };
  paging?: { next?: string };
}

export interface MetaConversionRow {
  date: string; // YYYY-MM-DD
  account_id: string;
  account_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases_1d_view_28d_click: number;
  purchase_value_1d_view_28d_click: number;
  checkouts_1d_view_28d_click: number;
  registrations_1d_view_28d_click: number;
  purchases_1d_view: number;
  purchases_28d_click: number;
  purchase_value_1d_view: number;
  purchase_value_28d_click: number;
  checkouts_1d_view: number;
  checkouts_28d_click: number;
  registrations_1d_view: number;
  registrations_28d_click: number;
  roas_1d_view_28d_click: number;
  cpa_1d_view_28d_click: number | null;
  fetched_at: Date;
}

// =====================================================
// PRIVATE: HTTP
// =====================================================

async function fetchInsightsWithWindow(
  adAccountId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  attributionWindow: "1d_view" | "28d_click",
): Promise<MetaInsightsRecord[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields:
      "account_id,account_name,date_start,date_stop,impressions,clicks,spend,actions,action_values",
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    level: "account",
    time_increment: "1",
    filtering: JSON.stringify([
      {
        field: "action_type",
        operator: "IN",
        value: ["purchase", "complete_registration", "initiate_checkout"],
      },
    ]),
    limit: "1000",
    action_attribution_windows: `["${attributionWindow}"]`,
  });

  const all: MetaInsightsRecord[] = [];
  let fetchUrl: string | null = `${BASE_URL}/${adAccountId}/insights?${params.toString()}`;
  let page = 0;

  while (fetchUrl) {
    const response = await fetch(fetchUrl, { cache: "no-store" });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Meta API ${response.status}: ${body}`);
    }

    const json = (await response.json()) as MetaInsightsPageResponse;
    if (json.error) {
      throw new Error(
        `Meta API error (code ${json.error.code}): ${json.error.message}`,
      );
    }

    all.push(...(json.data ?? []));
    fetchUrl = json.paging?.next ?? null;
    page++;

    if (fetchUrl) {
      // Rate limit breathing room
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(
    `[Meta] ${attributionWindow}: fetched ${all.length} records in ${page} page(s)`,
  );
  return all;
}

// =====================================================
// PRIVATE: COMBINE
// =====================================================

function combineAttributionData(
  data1d: MetaInsightsRecord[],
  data28d: MetaInsightsRecord[],
): MetaInsightsRecord[] {
  const combined = new Map<string, MetaInsightsRecord>();

  // Seed with 28d_click data (has the 28d_click attribution values)
  for (const record of data28d) {
    combined.set(record.date_start, { ...record });
  }

  // Merge 1d_view attribution values in
  for (const record of data1d) {
    const key = record.date_start;
    const existing = combined.get(key);

    if (!existing) {
      combined.set(key, { ...record });
      continue;
    }

    // Merge actions (conversions count)
    if (record.actions) {
      const actionMap = new Map<string, MetaAction>();
      for (const a of existing.actions ?? []) {
        actionMap.set(a.action_type, { ...a });
      }
      for (const a of record.actions) {
        const ex = actionMap.get(a.action_type);
        if (ex) {
          ex["1d_view"] = a["1d_view"] ?? a.value;
        } else {
          actionMap.set(a.action_type, { ...a });
        }
      }
      existing.actions = [...actionMap.values()];
    }

    // Merge action_values (revenue)
    if (record.action_values) {
      const valMap = new Map<string, MetaAction>();
      for (const av of existing.action_values ?? []) {
        valMap.set(av.action_type, { ...av });
      }
      for (const av of record.action_values) {
        const ex = valMap.get(av.action_type);
        if (ex) {
          ex["1d_view"] = av["1d_view"] ?? av.value;
        } else {
          valMap.set(av.action_type, { ...av });
        }
      }
      existing.action_values = [...valMap.values()];
    }
  }

  return [...combined.values()];
}

// =====================================================
// PRIVATE: TRANSFORM
// =====================================================

function transformRecord(
  record: MetaInsightsRecord,
  adAccountId: string,
): MetaConversionRow {
  const row: MetaConversionRow = {
    date: record.date_start,
    account_id: record.account_id ?? adAccountId.replace("act_", ""),
    account_name: record.account_name ?? "Unknown",
    spend: parseFloat(record.spend ?? "0"),
    impressions: parseInt(record.impressions ?? "0", 10),
    clicks: parseInt(record.clicks ?? "0", 10),
    purchases_1d_view_28d_click: 0,
    purchase_value_1d_view_28d_click: 0,
    checkouts_1d_view_28d_click: 0,
    registrations_1d_view_28d_click: 0,
    purchases_1d_view: 0,
    purchases_28d_click: 0,
    purchase_value_1d_view: 0,
    purchase_value_28d_click: 0,
    checkouts_1d_view: 0,
    checkouts_28d_click: 0,
    registrations_1d_view: 0,
    registrations_28d_click: 0,
    roas_1d_view_28d_click: 0,
    cpa_1d_view_28d_click: null,
    fetched_at: new Date(),
  };

  // Process actions (conversion counts)
  for (const action of record.actions ?? []) {
    const total = parseFloat(action.value ?? "0");
    const view1d = parseFloat(action["1d_view"] ?? "0");
    const click28d = parseFloat(action["28d_click"] ?? "0");

    switch (action.action_type) {
      case "purchase":
        row.purchases_1d_view_28d_click = total;
        row.purchases_1d_view = view1d;
        row.purchases_28d_click = click28d;
        break;
      case "initiate_checkout":
        row.checkouts_1d_view_28d_click = total;
        row.checkouts_1d_view = view1d;
        row.checkouts_28d_click = click28d;
        break;
      case "complete_registration":
        row.registrations_1d_view_28d_click = total;
        row.registrations_1d_view = view1d;
        row.registrations_28d_click = click28d;
        break;
    }
  }

  // Process action_values (revenue)
  for (const av of record.action_values ?? []) {
    if (av.action_type === "purchase") {
      row.purchase_value_1d_view_28d_click = parseFloat(av.value ?? "0");
      row.purchase_value_1d_view = parseFloat(av["1d_view"] ?? "0");
      row.purchase_value_28d_click = parseFloat(av["28d_click"] ?? "0");
    }
  }

  // Calculated metrics
  if (row.spend > 0) {
    row.roas_1d_view_28d_click =
      row.purchase_value_1d_view_28d_click / row.spend;
    row.cpa_1d_view_28d_click =
      row.purchases_1d_view_28d_click > 0
        ? row.spend / row.purchases_1d_view_28d_click
        : null;
  }

  return row;
}

// =====================================================
// PUBLIC API
// =====================================================

/**
 * Fetch account-level conversion data from Meta Marketing API.
 *
 * Makes two requests — one per attribution window — then combines them:
 * - 1d_view: conversions within 1 day of seeing an ad
 * - 28d_click: conversions within 28 days of clicking an ad
 *
 * Reference: wander-growth-api/app/services/Meta/meta_ads_service.py
 */
export async function fetchMetaConversions(params: {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}): Promise<MetaConversionRow[]> {
  const accessToken = env.FB_SYSUSER_TOKEN ?? env.META_ACCESS_TOKEN;
  const adAccountId = env.META_AD_ACCOUNT_ID;

  if (!accessToken) {
    throw new Error("FB_SYSUSER_TOKEN or META_ACCESS_TOKEN is required");
  }
  if (!adAccountId) {
    throw new Error("META_AD_ACCOUNT_ID is required");
  }
  if (!adAccountId.startsWith("act_")) {
    throw new Error(
      "META_AD_ACCOUNT_ID must start with 'act_' (e.g. act_885632589057558)",
    );
  }

  console.log(
    `[Meta] Fetching insights ${params.startDate} → ${params.endDate}`,
  );

  // Fetch both attribution windows in parallel
  const [data1d, data28d] = await Promise.all([
    fetchInsightsWithWindow(
      adAccountId,
      accessToken,
      params.startDate,
      params.endDate,
      "1d_view",
    ),
    fetchInsightsWithWindow(
      adAccountId,
      accessToken,
      params.startDate,
      params.endDate,
      "28d_click",
    ),
  ]);

  const combined = combineAttributionData(data1d, data28d);
  const rows = combined
    .map((r) => transformRecord(r, adAccountId))
    .sort((a, b) => a.date.localeCompare(b.date));

  console.log(`[Meta] Combined → ${rows.length} rows`);
  return rows;
}
