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

type MetaError = {
  error?: { message: string; code?: number; error_user_msg?: string };
};

function adsToken() {
  const token =
    env.META_ADS_ACCESS_TOKEN ?? env.FB_SYSUSER_TOKEN ?? env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ADS_ACCESS_TOKEN is required");
  return token;
}

// Throttled: the ad account's business-use-case limit (17, 80004) or the
// app's (4, 613). Meta says in a header how long until it lets us back in.
const THROTTLED = new Set([4, 17, 613, 80004]);

/** Wait out Meta's rate limit once, up to five minutes, then retry. */
async function metaFetch<T>(url: string, init?: RequestInit) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const json = (await response.json()) as T & MetaError;
    const code = json.error?.code;
    if (!json.error || !code || !THROTTLED.has(code) || attempt > 0) {
      if (json.error)
        throw new Error(json.error.error_user_msg ?? json.error.message);
      return json;
    }
    const usage = JSON.parse(
      response.headers.get("x-business-use-case-usage") ?? "{}",
    ) as Record<string, { estimated_time_to_regain_access?: number }[]>;
    const minutes = Math.max(
      1,
      ...Object.values(usage)
        .flat()
        .map((row) => row.estimated_time_to_regain_access ?? 0),
    );
    if (minutes > 5) throw new Error(json.error.message);
    await new Promise((resolve) => setTimeout(resolve, minutes * 60_000));
  }
}

async function metaWrite<T>(path: string, body: Record<string, unknown>) {
  const form = new URLSearchParams({ access_token: adsToken() });
  for (const [key, value] of Object.entries(body))
    form.set(key, typeof value === "string" ? value : JSON.stringify(value));
  return metaFetch<T>(`${ADS_WRITE_URL}/${path}`, {
    method: "POST",
    body: form,
  });
}

async function metaRead<T>(
  path: string,
  fields: string,
  query: Record<string, string> = {},
) {
  const params = new URLSearchParams({
    ...query,
    access_token: adsToken(),
    fields,
  });
  return metaFetch<T>(`${ADS_WRITE_URL}/${path}?${params}`);
}

/**
 * Share an audience with another ad account the business can reach, for
 * targeting only (no insights, no lookalikes off it). Idempotent on Meta's
 * side. https://developers.facebook.com/docs/marketing-api/reference/custom-audience/adaccounts/
 */
export async function shareMetaAudience(input: {
  audienceId: string;
  adAccountId: string;
}) {
  await metaWrite<{ success?: boolean }>(`${input.audienceId}/adaccounts`, {
    adaccounts: [input.adAccountId.replace(/^act_/, "")],
    permissions: "targeting",
  });
}

/** Ad account ids (bare numbers) an audience is shared with. */
export async function listMetaAudienceShares(audienceId: string) {
  // Meta lists recipients as bare account numbers: { data: ["2152…"] }.
  const result = await metaRead<{
    data?: (string | number | { id?: string; account_id?: string | number })[];
  }>(`${audienceId}/adaccounts`, "id");
  return (result.data ?? []).flatMap((row) => {
    const id = typeof row === "object" ? (row.id ?? row.account_id) : row;
    return id == null ? [] : [String(id).replace(/^act_/, "")];
  });
}

/** Verify the provider's paused-create promise before recording the campaign. */
export async function ensureMetaAdsPaused(
  adIds: string[],
  client = {
    statuses: (ids: string[]) =>
      metaRead<Record<string, { id: string; status: string }>>(
        "",
        "id,status",
        { ids: ids.join(",") },
      ),
    pause: (id: string) =>
      metaWrite<{ success: boolean }>(id, { status: "PAUSED" }),
    status: (id: string) => metaRead<{ status: string }>(id, "status"),
  },
) {
  for (let offset = 0; offset < adIds.length; offset += 20) {
    const ids = adIds.slice(offset, offset + 20);
    const rows = await client.statuses(ids);
    await Promise.all(
      ids.map(async (id) => {
        if (!rows[id])
          throw new Error(
            `Meta did not return ad ${id} for pause verification`,
          );
        if (rows[id].status === "PAUSED") return;
        const result = await client.pause(id);
        if (!result.success) throw new Error(`Meta could not pause ad ${id}`);
        const verified = await client.status(id);
        if (verified.status !== "PAUSED")
          throw new Error(`Meta ad ${id} is still ${verified.status}`);
      }),
    );
  }
}

/**
 * Upload images to the ad account in ONE request, so a carousel's three
 * sizes cost one write, not one per file. Hashes are per ad account and
 * returned in the order given; a repeated URL is uploaded once.
 */
async function uploadMetaAdImages(adAccountId: string, imageUrls: string[]) {
  const unique = [...new Set(imageUrls)];
  const form = new FormData();
  form.set("access_token", adsToken());
  await Promise.all(
    unique.map(async (url, i) => {
      const image = await fetch(url);
      if (!image.ok) throw new Error(`Image fetch ${image.status}: ${url}`);
      const type = image.headers.get("content-type") ?? "image/png";
      const name = `image_${i}.${type.includes("jpeg") ? "jpg" : "png"}`;
      form.set(name, new Blob([await image.arrayBuffer()], { type }), name);
    }),
  );
  const result = await metaFetch<{ images: Record<string, { hash: string }> }>(
    `${ADS_WRITE_URL}/${adAccountId}/adimages`,
    { method: "POST", body: form },
  );
  const hashOf = new Map(
    unique.map((url, i) => {
      const entry = Object.entries(result.images).find(([key]) =>
        key.startsWith(`image_${i}.`),
      );
      if (!entry) throw new Error(`Meta returned no hash for ${url}`);
      return [url, entry[1].hash] as const;
    }),
  );
  return imageUrls.map((url) => hashOf.get(url)!);
}

/**
 * Every Advantage+ creative enhancement Meta lists, switched off: the ad runs
 * as the artwork and words that were approved. Meta turns on a feature that
 * is missing from this list, so add new ones as Meta announces them.
 */
const META_CREATIVE_FEATURES = [
  "adapt_to_placement",
  "add_text_overlay",
  "ads_with_benefits",
  "advantage_plus_creative",
  "app_highlights",
  "audio",
  "auto_promotion_tag",
  "biz_ai",
  "carousel_to_video",
  "catalog_feed_tag",
  "creative_stickers",
  "customize_product_recommendation",
  "cv_transformation",
  "description_automation",
  "dha_optimization",
  "dynamic_cta_text",
  "dynamic_partner_content",
  "enable_ncs_testimonials",
  "enhance_cta",
  "fb_feed_tag",
  "fb_reels_tag",
  "fb_story_tag",
  "feed_caption_optimization",
  "generate_cta",
  "hide_price",
  "hyperlink_formatting",
  "ig_feed_tag",
  "ig_glados_feed",
  "ig_reels_tag",
  "ig_stream_tag",
  "ig_video_native_subtitle",
  "image_animation",
  "image_auto_crop",
  "image_background_gen",
  "image_banner",
  "image_brightness_and_contrast",
  "image_end_card",
  "image_enhancement",
  "image_templates",
  "image_text_translation",
  "image_touchups",
  "image_uncrop",
  "inline_comment",
  "local_store_extension",
  "media_liquidity_animated_image",
  "media_order",
  "media_type_automation",
  "multi_creative_post_carousel",
  "multi_photo_to_video",
  "music_generation",
  "pac_genai_recomposition",
  "pac_recomposition",
  "pac_relaxation",
  "product_browsing",
  "product_extensions",
  "product_metadata_automation",
  "product_tags",
  "profile_card",
  "profile_extension",
  "replace_media_text",
  "reveal_details_over_time",
  "show_destination_blurbs",
  "show_summary",
  "site_extensions",
  "standard_enhancements_catalog",
  "text_extraction_for_headline",
  "text_extraction_for_tap_target",
  "text_formatting_optimization",
  "text_generation",
  "text_optimizations",
  "text_overlay_translation",
  "text_translation",
  "translate_voiceover",
  "video_auto_crop",
  "video_filtering",
  "video_highlight",
  "video_highlights",
  "video_to_image",
  "video_uncrop",
  "video_uncrop_9x16_to_9x18",
  "video_voiceover",
  "wa_mm_image_filtering",
  "wa_mm_text_truncation_length",
] as const;

/** Who the ad runs as and what every creative carries. */
export type MetaCreativeTemplate = {
  pageId: string;
  instagramUserId: string;
  urlTags: string;
};

/** The Page's own Instagram account, the one Ads Manager would pick. */
export async function metaCreativeTemplate(input: {
  pageId: string;
  urlTags: string;
}): Promise<MetaCreativeTemplate> {
  const page = await metaRead<{ instagram_business_account?: { id: string } }>(
    input.pageId,
    "instagram_business_account",
  );
  const instagramUserId = page.instagram_business_account?.id;
  if (!instagramUserId)
    throw new Error(
      "The brand's Facebook Page has no Instagram account connected, so Instagram placements would run as the Page. Connect it in Meta Business Suite.",
    );
  return { ...input, instagramUserId };
}

type MetaCreativeSet = { imageUrls: string[]; positions: MetaPositions };

/**
 * The ad's finished creative, built on Meta before the ad exists, so the
 * push only attaches it and Meta can preview exactly what will run. One set
 * of images per group of placements: square wherever Meta shows a single
 * image square, 4:5 on Instagram's main feed, 9:16 in stories and reels. One
 * set is a plain creative; more use placement asset customization, the same
 * as "Edit placement" in Ads Manager. Rules cannot split by device.
 * https://developers.facebook.com/docs/marketing-api/dynamic-creative/placement-asset-customization/
 */
export async function createMetaPlacementCreative(input: {
  adAccountId: string;
  template: MetaCreativeTemplate;
  name: string;
  message: string;
  callToActionType: string;
  /** One card is a single image ad; two or more a carousel. */
  cards: { title: string; description?: string; link: string }[];
  /** In priority order, one image per card each. */
  sets: MetaCreativeSet[];
}) {
  const { cards, template, sets } = input;
  if (!sets.length) throw new Error("A creative needs at least one image set");
  if (sets.some((set) => set.imageUrls.length !== cards.length))
    throw new Error("Every set needs one image per card");
  const carousel = cards.length > 1;
  const flat = await uploadMetaAdImages(
    input.adAccountId,
    sets.flatMap((set) => set.imageUrls),
  );
  const hashAt = (set: number, card: number) =>
    flat[set * cards.length + card]!;
  const common = {
    name: input.name,
    url_tags: template.urlTags,
    degrees_of_freedom_spec: {
      creative_features_spec: Object.fromEntries(
        META_CREATIVE_FEATURES.map((feature) => [
          feature,
          { enroll_status: "OPT_OUT" },
        ]),
      ),
    },
  };
  const page = {
    page_id: template.pageId,
    instagram_user_id: template.instagramUserId,
  };
  const callToAction = (link: string) => ({
    type: input.callToActionType,
    value: { link },
  });

  if (sets.length === 1) {
    const [card] = cards;
    const { id } = await metaWrite<{ id: string }>(
      `${input.adAccountId}/adcreatives`,
      {
        ...common,
        object_story_spec: {
          ...page,
          link_data: carousel
            ? {
                link: card!.link,
                message: input.message,
                multi_share_end_card: false,
                multi_share_optimized: false,
                child_attachments: cards.map((child, i) => ({
                  link: child.link,
                  name: child.title,
                  ...(child.description
                    ? { description: child.description }
                    : {}),
                  image_hash: hashAt(0, i),
                  call_to_action: callToAction(child.link),
                })),
                call_to_action: callToAction(card!.link),
              }
            : {
                link: card!.link,
                message: input.message,
                name: card!.title,
                ...(card!.description
                  ? { description: card!.description }
                  : {}),
                image_hash: hashAt(0, 0),
                call_to_action: callToAction(card!.link),
              },
        },
      },
    );
    return { creativeId: id };
  }

  // Meta refuses duplicate asset values, so equal texts and images share
  // one labelled entry. Every text is labelled and every rule names its
  // labels: an unlabelled text is dropped from the placements the rules
  // cover (a carousel once ran with no primary text that way).
  const unique = (values: string[]) => [...new Set(values)];
  const hashes = unique(flat);
  const titles = unique(cards.map((card) => card.title));
  const descriptions = unique(
    cards.flatMap((card) => (card.description ? [card.description] : [])),
  );
  const links = unique(cards.map((card) => card.link));
  const label = (name: string) => ({ name });
  const imageLabel = (set: number, card: number) =>
    label(`image_${hashes.indexOf(hashAt(set, card))}`);
  const textLabels = (card: (typeof cards)[number]) => ({
    title_label: label(`title_${titles.indexOf(card.title)}`),
    ...(card.description
      ? {
          description_label: label(
            `description_${descriptions.indexOf(card.description)}`,
          ),
        }
      : {}),
    link_url_label: label(`link_${links.indexOf(card.link)}`),
  });
  const spec = (positions: MetaPositions) => ({
    publisher_platforms: positions.publisherPlatforms,
    ...(positions.facebookPositions
      ? { facebook_positions: positions.facebookPositions }
      : {}),
    ...(positions.instagramPositions
      ? { instagram_positions: positions.instagramPositions }
      : {}),
  });

  const { id } = await metaWrite<{ id: string }>(
    `${input.adAccountId}/adcreatives`,
    {
      ...common,
      object_story_spec: page,
      asset_feed_spec: {
        images: hashes.map((hash, i) => ({
          hash,
          adlabels: [label(`image_${i}`)],
        })),
        titles: titles.map((text, i) => ({
          text,
          adlabels: [label(`title_${i}`)],
        })),
        ...(descriptions.length
          ? {
              descriptions: descriptions.map((text, i) => ({
                text,
                adlabels: [label(`description_${i}`)],
              })),
            }
          : {}),
        link_urls: links.map((website_url, i) => ({
          website_url,
          adlabels: [label(`link_${i}`)],
        })),
        bodies: [{ text: input.message, adlabels: [label("body_0")] }],
        call_to_action_types: [input.callToActionType],
        ad_formats: [carousel ? "CAROUSEL" : "SINGLE_IMAGE"],
        optimization_type: "PLACEMENT",
        ...(carousel
          ? {
              carousels: sets.map((_, s) => ({
                adlabels: [label(`carousel_${s}`)],
                child_attachments: cards.map((card, i) => ({
                  image_label: imageLabel(s, i),
                  ...textLabels(card),
                })),
                multi_share_end_card: false,
              })),
            }
          : {}),
        asset_customization_rules: sets.map((set, s) => ({
          customization_spec: spec(set.positions),
          body_label: label("body_0"),
          ...(carousel
            ? { carousel_label: label(`carousel_${s}`) }
            : { image_label: imageLabel(s, 0), ...textLabels(cards[0]!) }),
          priority: s + 1,
        })),
      },
    },
  );
  return { creativeId: id };
}
