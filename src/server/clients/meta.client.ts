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
  let fetchUrl: string | null =
    `${BASE_URL}/${adAccountId}/insights?${params.toString()}`;
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

// =====================================================
// PUBLIC API — CAMPAIGN-LEVEL DAILY INSIGHTS
// =====================================================

export interface MetaCampaignDayRecord {
  date_start: string;
  date_stop: string;
  campaign_name?: string;
  spend: string;
  clicks: string;
  impressions: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}

/**
 * Fetch CAMPAIGN-level daily insights with both attribution windows
 * (28d_click + 1d_view) in a single request — each action entry carries both
 * window keys. Used by the spend tracker, which needs campaign names to apply
 * the marketplace campaign denylist (the ad account is shared with
 * WanderOS/Listed — see spend-tracker.config.ts NON_MARKETPLACE_CAMPAIGN_PATTERN).
 *
 * Ported from wander-growth-tracker src/lib/meta/queries.ts (fetchMetaInsights).
 */
export async function fetchMetaCampaignDailyInsights(params: {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}): Promise<MetaCampaignDayRecord[]> {
  const accessToken = env.FB_SYSUSER_TOKEN ?? env.META_ACCESS_TOKEN;
  const adAccountId = env.META_AD_ACCOUNT_ID;

  if (!accessToken) {
    throw new Error("FB_SYSUSER_TOKEN or META_ACCESS_TOKEN is required");
  }
  if (!adAccountId?.startsWith("act_")) {
    throw new Error("META_AD_ACCOUNT_ID must start with 'act_'");
  }

  const urlParams = new URLSearchParams({
    access_token: accessToken,
    fields:
      "campaign_name,date_start,date_stop,impressions,clicks,spend,actions,action_values",
    time_range: JSON.stringify({
      since: params.startDate,
      until: params.endDate,
    }),
    level: "campaign",
    time_increment: "1",
    // NOTE: deliberately NO `filtering` param — filtering on action_type would
    // drop campaign-days that had spend but zero purchases, losing spend.
    // (The tracker's fetchMetaInsights had no filtering either.)
    limit: "500",
    action_attribution_windows: JSON.stringify(["28d_click", "1d_view"]),
  });

  const all: MetaCampaignDayRecord[] = [];
  let fetchUrl: string | null =
    `${BASE_URL}/${adAccountId}/insights?${urlParams.toString()}`;
  let page = 0;

  while (fetchUrl) {
    const response = await fetch(fetchUrl, { cache: "no-store" });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Meta API ${response.status}: ${body}`);
    }

    const json = (await response.json()) as {
      data?: MetaCampaignDayRecord[];
      error?: { message: string; code: number };
      paging?: { next?: string };
    };
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
    `[Meta] campaign-daily: fetched ${all.length} campaign-day rows in ${page} page(s)`,
  );
  return all;
}

// =====================================================
// CAROUSEL PLACEMENT CARDS
// =====================================================

const ADS_WRITE_URL = "https://graph.facebook.com/v23.0";

type MetaPositions = {
  publisherPlatforms: string[];
  facebookPositions?: string[];
  instagramPositions?: string[];
};

async function metaWrite<T>(path: string, body: Record<string, unknown>) {
  const accessToken = env.FB_SYSUSER_TOKEN ?? env.META_ACCESS_TOKEN;
  if (!accessToken) throw new Error("FB_SYSUSER_TOKEN is required");
  const form = new URLSearchParams({ access_token: accessToken });
  for (const [key, value] of Object.entries(body))
    form.set(key, typeof value === "string" ? value : JSON.stringify(value));
  const url = `${ADS_WRITE_URL}/${path}`;
  const response = await fetch(url, { method: "POST", body: form });
  const json = (await response.json()) as T & {
    error?: { message: string; error_user_msg?: string };
  };
  if (json.error)
    throw new Error(json.error.error_user_msg ?? json.error.message);
  return json;
}

async function metaRead<T>(path: string, fields: string) {
  const accessToken = env.FB_SYSUSER_TOKEN ?? env.META_ACCESS_TOKEN;
  if (!accessToken) throw new Error("FB_SYSUSER_TOKEN is required");
  const params = new URLSearchParams({ access_token: accessToken, fields });
  const response = await fetch(`${ADS_WRITE_URL}/${path}?${params}`, {
    cache: "no-store",
  });
  const json = (await response.json()) as T & { error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json;
}

async function uploadMetaAdImage(adAccountId: string, imageUrl: string) {
  const image = await fetch(imageUrl);
  if (!image.ok) throw new Error(`Image fetch ${image.status}: ${imageUrl}`);
  const bytes = Buffer.from(await image.arrayBuffer()).toString("base64");
  const result = await metaWrite<{ images: Record<string, { hash: string }> }>(
    `${adAccountId}/adimages`,
    { bytes },
  );
  return Object.values(result.images)[0]!.hash;
}

/**
 * Give a pushed carousel ad its 9:16 cards in stories and reels. Zernio can
 * only send one set of cards, which Meta letterboxes there. Meta's placement
 * asset customization can pin a second set of cards per placement, the same
 * as "Edit placement" in Ads Manager, so the ad's creative is rebuilt on the
 * Graph API from the pushed one and swapped in. Same ad, same ad set.
 * https://developers.facebook.com/docs/marketing-api/dynamic-creative/placement-asset-customization/
 */
export async function setMetaCarouselPlacementCards(input: {
  adAccountId: string;
  adId: string;
  feedImageUrls: string[];
  tallImageUrls: string[];
  feedPositions: MetaPositions;
  tallPositions: MetaPositions;
}) {
  const { creative } = await metaRead<{
    creative: {
      object_story_spec: {
        page_id: string;
        instagram_user_id?: string;
        link_data: {
          message: string;
          call_to_action: { type: string };
          child_attachments: {
            name: string;
            description?: string;
            link: string;
          }[];
        };
      };
      url_tags?: string;
      degrees_of_freedom_spec?: unknown;
    };
  }>(
    input.adId,
    "creative{object_story_spec,url_tags,degrees_of_freedom_spec}",
  );
  const story = creative.object_story_spec;
  const cards = story.link_data.child_attachments;
  if (
    cards.length !== input.feedImageUrls.length ||
    cards.length !== input.tallImageUrls.length
  )
    throw new Error("Card count differs from the pushed carousel");

  const feedHashes = await Promise.all(
    input.feedImageUrls.map((url) => uploadMetaAdImage(input.adAccountId, url)),
  );
  const tallHashes = await Promise.all(
    input.tallImageUrls.map((url) => uploadMetaAdImage(input.adAccountId, url)),
  );
  // Meta refuses duplicate asset values, so equal texts share one entry.
  const unique = (values: string[]) => [...new Set(values)];
  const titles = unique(cards.map((card) => card.name));
  const descriptions = unique(
    cards.flatMap((card) => (card.description ? [card.description] : [])),
  );
  const links = unique(cards.map((card) => card.link));
  const childAttachments = (side: "feed" | "tall") =>
    cards.map((card, i) => ({
      image_label: { name: `${side}_${i}` },
      title_label: { name: `title_${titles.indexOf(card.name)}` },
      ...(card.description
        ? {
            description_label: {
              name: `description_${descriptions.indexOf(card.description)}`,
            },
          }
        : {}),
      link_url_label: { name: `link_${links.indexOf(card.link)}` },
    }));
  const spec = (positions: MetaPositions) => ({
    publisher_platforms: positions.publisherPlatforms,
    ...(positions.facebookPositions
      ? { facebook_positions: positions.facebookPositions }
      : {}),
    ...(positions.instagramPositions
      ? { instagram_positions: positions.instagramPositions }
      : {}),
  });

  const { id: creativeId } = await metaWrite<{ id: string }>(
    `${input.adAccountId}/adcreatives`,
    {
      object_story_spec: {
        page_id: story.page_id,
        ...(story.instagram_user_id
          ? { instagram_user_id: story.instagram_user_id }
          : {}),
      },
      ...(creative.url_tags ? { url_tags: creative.url_tags } : {}),
      ...(creative.degrees_of_freedom_spec
        ? { degrees_of_freedom_spec: creative.degrees_of_freedom_spec }
        : {}),
      asset_feed_spec: {
        images: [
          ...feedHashes.map((hash, i) => ({
            hash,
            adlabels: [{ name: `feed_${i}` }],
          })),
          ...tallHashes.map((hash, i) => ({
            hash,
            adlabels: [{ name: `tall_${i}` }],
          })),
        ],
        titles: titles.map((text, i) => ({
          text,
          adlabels: [{ name: `title_${i}` }],
        })),
        ...(descriptions.length
          ? {
              descriptions: descriptions.map((text, i) => ({
                text,
                adlabels: [{ name: `description_${i}` }],
              })),
            }
          : {}),
        link_urls: links.map((website_url, i) => ({
          website_url,
          adlabels: [{ name: `link_${i}` }],
        })),
        bodies: [{ text: story.link_data.message }],
        call_to_action_types: [story.link_data.call_to_action.type],
        ad_formats: ["CAROUSEL"],
        optimization_type: "PLACEMENT",
        carousels: [
          {
            adlabels: [{ name: "carousel_feed" }],
            child_attachments: childAttachments("feed"),
            multi_share_end_card: false,
          },
          {
            adlabels: [{ name: "carousel_tall" }],
            child_attachments: childAttachments("tall"),
            multi_share_end_card: false,
          },
        ],
        asset_customization_rules: [
          {
            customization_spec: spec(input.feedPositions),
            carousel_label: { name: "carousel_feed" },
            priority: 1,
          },
          {
            customization_spec: spec(input.tallPositions),
            carousel_label: { name: "carousel_tall" },
            priority: 2,
          },
        ],
      },
    },
  );
  await metaWrite(input.adId, { creative: { creative_id: creativeId } });
  return { creativeId };
}
