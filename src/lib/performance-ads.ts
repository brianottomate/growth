/**
 * Performance ad conventions: the house style for client campaign builds.
 *
 * These are Brooke's conventions, lifted from the first live Performance
 * campaign (Away & Stay, 2026-08) and her walkthrough recordings, so that a
 * Growth-generated build is recognisably the same thing she would have made by
 * hand in Ads Manager. Where our own data gave a better answer than the manual
 * build (budget derived from the cycle rather than the billed amount) the
 * reasoning is recorded next to the constant.
 *
 * Rationale and the open questions live in docs/performance-ads-playbook.md.
 */

export const PERFORMANCE_AD_DEFAULTS = {
  /**
   * Meta removed BOOK_NOW, and LEARN_MORE reads as a content click on a
   * property page. SEE_DETAILS is what the live build uses.
   */
  callToAction: "SEE_DETAILS",

  /**
   * VALUE, not OFFSITE_CONVERSIONS. Nightly rates across a portfolio vary by
   * several hundred dollars, so optimizing for conversion count buys the
   * cheapest booking rather than the best one.
   */
  optimizationGoal: "VALUE",

  /** Sales objective; the product being sold is a stay. */
  objective: "OUTCOME_SALES",

  /**
   * Budget lives on the ad set, never the campaign. A Performance campaign
   * gains audiences as the customer's spend grows (see audiencePlanFor), and
   * CBO would silently reallocate a customer's money across them.
   */
  budgetLevel: "adset",

  /**
   * Meta turns these on by default and they visibly mangle the creative —
   * cropping, filters, generated captions over the property photography.
   * Every generated draft must switch them off.
   */
  disableAdvantageEnhancements: true,

  /**
   * Tracking sits on the AD object and is NOT inherited from the ad set, so it
   * has to be sent on every ad, including ads attached to an existing ad set.
   */
  requireTrackingPerAd: true,
} as const;

/** Whole-dollar monthly media spend thresholds for how many audiences to run. */
export const AUDIENCE_BUDGET_TIERS = [
  { minMonthlyMedia: 5_000, audiences: 3 },
  { minMonthlyMedia: 1_000, audiences: 2 },
  { minMonthlyMedia: 0, audiences: 1 },
] as const;

export type PerformanceAudienceKind =
  | "lookalike_booker_seed"
  | "prospecting_list"
  | "third_party_intent";

/**
 * Audience count follows the budget, not the ambition.
 *
 * Three audiences were scoped for Away & Stay and one shipped, deliberately:
 * splitting a few hundred dollars across three ad sets starves all of them and
 * none ever leaves the learning phase. The lookalike goes first because a seed
 * of real bookers outperforms a seed of viewers.
 */
export function audiencePlanFor(
  monthlyMediaBudget: number,
): PerformanceAudienceKind[] {
  const tier =
    AUDIENCE_BUDGET_TIERS.find(
      (candidate) => monthlyMediaBudget >= candidate.minMonthlyMedia,
    ) ?? AUDIENCE_BUDGET_TIERS[AUDIENCE_BUDGET_TIERS.length - 1]!;
  const order: PerformanceAudienceKind[] = [
    "lookalike_booker_seed",
    "prospecting_list",
    "third_party_intent",
  ];
  return order.slice(0, tier.audiences);
}

/** The account floor Meta reports for USD ad accounts. */
export const MIN_DAILY_BUDGET_USD = 1;

/**
 * Daily budget comes from the cycle's media budget, never the billed amount.
 * The gap between the two is the take rate; dividing what the customer pays
 * across the month overspends the media plan by exactly that margin.
 */
export function dailyBudgetFromMedia(input: {
  mediaBudget: number;
  days: number;
  adSets?: number;
}): number {
  const adSets = input.adSets ?? 1;
  if (input.days <= 0 || adSets <= 0) {
    throw new Error("days and adSets must be positive");
  }
  const perAdSet = input.mediaBudget / input.days / adSets;
  return Math.max(
    MIN_DAILY_BUDGET_USD,
    Math.floor(perAdSet * 100) / 100, // never round a customer's budget up
  );
}

const upperSnake = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/&/g, "+")
    .replace(/[^A-Z0-9+]+/g, "+")
    .replace(/\++/g, "+")
    .replace(/^\+|\+$/g, "");

/** `202609`: the month a campaign is built for, as the names carry it. */
export function performancePeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * `META_PERF+WINTER+PARK+ESCAPES` for a paying client, `META_WANDER` for one of
 * Wander's own brands. Brooke's convention (2026-09-09): every level of the
 * build starts with the platform and the brand, and `PERF+` is what finance
 * filters client spend on, so a Wander brand must never carry it.
 */
export function performanceNamePrefix(input: {
  brandName: string;
  isClient: boolean;
}): string {
  const brand = upperSnake(input.brandName) || "WANDER";
  return input.isClient ? `META_PERF+${brand}` : `META_${brand}`;
}

/**
 * `META_PERF+WINTER+PARK+ESCAPES_SALES_PURCHASE_202609`
 *
 * Campaign level: prefix, then what the campaign sells and how it is bought,
 * then the month. The month is part of the name because a Performance client
 * is a monthly product and the reporting cuts along that line.
 */
export function performanceCampaignName(input: {
  customer: string;
  isClient?: boolean;
  period?: string;
}): string {
  return [
    performanceNamePrefix({
      brandName: input.customer,
      isClient: input.isClient ?? true,
    }),
    "SALES",
    "PURCHASE",
    input.period ?? performancePeriod(),
  ].join("_");
}

/**
 * The name a new campaign draft starts with, so every draft is born in the
 * house convention instead of whatever was typed in the moment. Always
 * editable in the form; this is the default, not a rule.
 */
export function campaignDraftName(input: {
  brandName: string;
  isClient: boolean;
  period?: string;
}): string {
  return performanceCampaignName({
    customer: input.brandName,
    isClient: input.isClient,
    period: input.period,
  });
}

/** The three audience families an ad set is named by. */
export type PerformanceAudienceLabel = "BROAD" | "LOOKALIKE" | "RETARGETING";

/** How the planned audience kinds read in an ad set name. */
export function audienceLabelForKind(
  kind: PerformanceAudienceKind,
): PerformanceAudienceLabel {
  const labels: Record<PerformanceAudienceKind, PerformanceAudienceLabel> = {
    lookalike_booker_seed: "LOOKALIKE",
    prospecting_list: "BROAD",
    third_party_intent: "BROAD",
  };
  return labels[kind];
}

/**
 * How a plan audience reads in an ad set name. Lookalikes name themselves;
 * a custom audience is people who already met the brand, so it retargets;
 * everything else (segments, intent, keywords) is prospecting, which the
 * convention calls broad.
 */
export function audienceLabelForPlan(
  audience: { type: string } | null | undefined,
): PerformanceAudienceLabel {
  if (!audience) return "BROAD";
  if (audience.type === "lookalike") return "LOOKALIKE";
  if (audience.type === "custom") return "RETARGETING";
  return "BROAD";
}

/**
 * `META_PERF+WINTER+PARK+ESCAPES_LOOKALIKE_TX+CO+FL`
 *
 * Ad set level: the audience family and the states most likely to book, as
 * two-letter codes joined with `+`. `US` when the set is national.
 */
export function performanceAdSetName(input: {
  customer: string;
  isClient?: boolean;
  audience: PerformanceAudienceLabel;
  states?: string[] | null;
}): string {
  const states = (input.states ?? [])
    .map((state) => state.trim().toUpperCase())
    .filter((state) => /^[A-Z]{2}$/.test(state));
  return [
    performanceNamePrefix({
      brandName: input.customer,
      isClient: input.isClient ?? true,
    }),
    input.audience,
    states.length > 0 ? states.join("+") : "US",
  ].join("_");
}

/**
 * `META_PERF+WINTER+PARK+ESCAPES_PURCHASE`
 *
 * The custom conversion a Performance ad set optimises toward. Wander's pixel
 * fires Purchase on wander.com and on every WanderOS storefront, so an ad set
 * pointed at the raw event is credited with bookings made anywhere in the
 * fleet within Meta's view window. The conversion narrows it to the client's
 * own host, and the name is the reuse key so a re-push finds it again.
 */
export function performanceConversionName(input: {
  customer: string;
  isClient?: boolean;
  event: string;
}): string {
  return [
    performanceNamePrefix({
      brandName: input.customer,
      isClient: input.isClient ?? true,
    }),
    input.event.trim().toUpperCase(),
  ].join("_");
}

/** Meta conversion rule: any URL on the host, in Meta's own grammar. */
export function hostScopedConversionRule(
  host: string,
): Record<string, unknown> {
  return { url: { i_contains: host } };
}

export type PerformanceAdFormat =
  | "Static"
  | "Carousel"
  | "Video"
  | "Influencer Video";

/** The format a creative ad compiles to, read off its media. */
export function adFormatFor(content: {
  media: { type: string }[];
}): PerformanceAdFormat {
  if (content.media.some((item) => item.type === "video")) return "Video";
  return content.media.length > 1 ? "Carousel" : "Static";
}

/**
 * `META_PERF+WINTER+PARK+ESCAPES_CAROUSEL_Roam River Mansion`
 *
 * Ad level: the format, then the property. The property name is kept
 * human-readable rather than slugged: this string is read in Ads Manager and
 * matched back to the onboarding list, not parsed.
 */
export function performanceAdName(input: {
  customer: string;
  isClient?: boolean;
  format: PerformanceAdFormat;
  propertyName: string;
}): string {
  return [
    performanceNamePrefix({
      brandName: input.customer,
      isClient: input.isClient ?? true,
    }),
    upperSnake(input.format).replace(/\+/g, "_"),
    input.propertyName.trim(),
  ].join("_");
}

/**
 * Deterministic key for one ad in one cycle, mirroring `campaignBusinessKey`'s
 * lower-cased colon-delimited shape. Stored on `ad_spot.businessKey` and sent
 * to the provider as the idempotency key, so the same ad drafted twice from
 * different surfaces is recognised as the same ad rather than duplicated.
 */
export function performanceAdBusinessKey(input: {
  accountId: string;
  period: string;
  adName: string;
}): string {
  return [input.accountId, input.period, input.adName]
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, "-"))
    .join(":");
}

/**
 * How many homes one set runs on. Meta's carousel holds ten cards, so ten
 * homes is the ceiling for the portfolio ad.
 *
 * This lives here rather than beside the component that draws the picker: a
 * server page importing a value from a `"use client"` module receives a
 * client reference instead of the number, and `slice(0, reference)` silently
 * returns nothing. That bug ate the whole `?homes=` pick.
 */
export const MAX_SET_HOMES = 10;

export type PerformanceAdPlanItem = {
  name: string;
  kind: "static" | "carousel" | "all_properties_carousel" | "catalog";
  propertyIndex: number | null;
  linkUrl: string | null;
};

/**
 * The ad set a Performance+ build ships.
 *
 * Per property: one static and one carousel. Then two portfolio ads that are
 * NOT interchangeable — a hand-built carousel of the homes in a chosen order,
 * and an Advantage+ catalog ad where Meta renders and ranks the same homes from
 * the product set. Running both is deliberate: the first controls the story,
 * the second lets Meta pick per viewer.
 */
export function buildPerformanceAdPlan(input: {
  customer: string;
  properties: { name: string; url: string }[];
}): PerformanceAdPlanItem[] {
  if (input.properties.length === 0) {
    throw new Error("A Performance+ plan needs at least one property");
  }
  const perProperty = input.properties.flatMap((property, index) =>
    (["Static", "Carousel"] as const).map((format) => ({
      name: performanceAdName({
        customer: input.customer,
        format,
        propertyName: property.name,
      }),
      kind: format === "Static" ? ("static" as const) : ("carousel" as const),
      propertyIndex: index,
      linkUrl: property.url,
    })),
  );
  return [
    ...perProperty,
    {
      name: performanceAdName({
        customer: input.customer,
        format: "Carousel",
        propertyName: "All properties",
      }),
      kind: "all_properties_carousel",
      propertyIndex: null,
      linkUrl: null,
    },
    {
      name: performanceAdName({
        customer: input.customer,
        format: "Carousel",
        propertyName: `Catalog ${input.properties.length} properties`,
      }),
      kind: "catalog",
      propertyIndex: null,
      linkUrl: null,
    },
  ];
}

// ---- THE SET AS A WALL --------------------------------------------------
//
// An ad declares what it is. Reading the format off the media worked while
// every ad was born with its cards, but a shell waiting for an upload has no
// cards yet, and a one-card carousel and a static look the same. The
// declared format is the truth; the media-based read remains for ads drawn
// before the field existed.

export const AD_FORMATS = [
  "static",
  "carousel",
  "video",
  "portfolio",
  "catalog",
] as const;
export type AdFormat = (typeof AD_FORMATS)[number];

export const AD_FORMAT_LABEL: Record<AdFormat, string> = {
  static: "Static",
  carousel: "Carousel",
  video: "Video",
  portfolio: "Portfolio carousel",
  catalog: "Catalog",
};

/**
 * Formats an operator makes by hand. The catalog ad is Meta's to render from
 * the product set once live; as a placeholder it holds one card per home so
 * the wall can show the shape before the feed exists. The portfolio carousel
 * comes from a build alone, since it is the homes in a chosen order.
 */
export const HAND_MADE_AD_FORMATS = [
  "static",
  "carousel",
  "catalog",
  "video",
] as const;

/** How many cards a format holds; Meta's carousel ceiling is ten. */
export function cardCapacity(format: AdFormat): number {
  return format === "static" || format === "video" ? 1 : 10;
}

export type FormatReadable = {
  format?: AdFormat;
  media: { type: string }[];
  propertyName?: string;
};

/**
 * What an ad is: declared when it says so, otherwise read off its cards the
 * way the push always has. A multi-card ad about one home is that home's
 * carousel; one about no home in particular is the portfolio.
 */
export function adFormatOf(content: FormatReadable): AdFormat {
  if (content.format) return content.format;
  if (content.media.some((item) => item.type === "video")) return "video";
  if (content.media.length > 1) {
    return content.propertyName ? "carousel" : "portfolio";
  }
  return "static";
}

/** The format the naming convention spells; every multi-card shape is a carousel there. */
export function performanceFormatFor(format: AdFormat): PerformanceAdFormat {
  if (format === "video") return "Video";
  if (format === "static") return "Static";
  return "Carousel";
}

/**
 * The home a finished creative is about, read off its filename.
 *
 * Brooke's exports follow the ad naming, brand first and the property after
 * the format or in second place: `LegacyRnR_Sonoma Glass House_CarouselA_
 * Slide01_1080x1350.png`. A file that does not read that way gives nothing,
 * and the ad waits for someone to bind a home rather than guessing one.
 */
export function homeNameFromFilename(filename: string): string | null {
  const stem = filename.replace(/\.[a-z0-9]+$/i, "").trim();
  const parts = stem
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;
  const isFormat = (part: string) =>
    /^(static|carousel|video)[a-z]?$/i.test(part);
  // Sizes, slide numbers and the brand prefix are not homes.
  const isHome = (part: string | undefined): part is string =>
    Boolean(part) &&
    !isFormat(part!) &&
    !/^(slide\s*\d+|\d+x\d+|meta|perf\+.*)$/i.test(part!);
  const formatAt = parts.findIndex(isFormat);
  // The property sits beside the format: after it in the ad convention,
  // before it in an export that carries slide and size after.
  // Brand_Home_Format_Headline puts the home before the format; the ad
  // convention Brand_Format_Home puts it after. When the format sits past
  // the second segment the one before it is the home, and the one after is
  // a headline; the brand prefix itself never is.
  const candidates =
    formatAt >= 2
      ? [parts[formatAt - 1], parts[formatAt + 1]]
      : formatAt === 1
        ? [parts[2]]
        : [parts[1]];
  return candidates.find(isHome) ?? null;
}

export type CardEdit<Item> =
  | { op: "replace"; index: number; item: Item }
  | { op: "append"; item: Item }
  | { op: "remove"; index: number }
  | { op: "move"; index: number; to: number };

/**
 * One change to an ad's cards, checked against what its format can hold.
 *
 * The rules are Meta's and the format's own: a video stands alone, a static
 * holds one card, a carousel holds two to ten and can be built up one card
 * at a time, so a single card in a carousel is allowed while it is being
 * filled. Throws with the reason rather than silently doing less.
 */
export function applyCardEdit<Item extends { type: string }>(
  content: { format?: AdFormat; media: Item[]; propertyName?: string },
  edit: CardEdit<Item>,
): Item[] {
  const format = adFormatOf(content);
  const media = [...content.media];
  const capacity = cardCapacity(format);
  const label = AD_FORMAT_LABEL[format].toLowerCase();

  const inRange = (index: number) => {
    if (index < 0 || index >= media.length) {
      throw new Error(
        `This ${label} has ${media.length} card${media.length === 1 ? "" : "s"}; there is no card ${index + 1}`,
      );
    }
  };
  const admits = (item: Item, replacing: boolean) => {
    if (item.type === "video" && format !== "video") {
      throw new Error(`A video goes on a video ad, not a ${label}`);
    }
    if (item.type !== "video" && format === "video") {
      throw new Error("A video ad takes a clip, not an image");
    }
    if (!replacing && media.length >= capacity) {
      throw new Error(
        capacity === 1
          ? `A ${label} holds one card; replace it instead`
          : `A ${label} holds ${capacity} cards`,
      );
    }
  };

  switch (edit.op) {
    case "replace":
      inRange(edit.index);
      admits(edit.item, true);
      media[edit.index] = edit.item;
      return media;
    case "append":
      admits(edit.item, false);
      media.push(edit.item);
      return media;
    case "remove":
      inRange(edit.index);
      media.splice(edit.index, 1);
      return media;
    case "move": {
      inRange(edit.index);
      inRange(edit.to);
      const [moved] = media.splice(edit.index, 1);
      media.splice(edit.to, 0, moved!);
      return media;
    }
  }
}

/**
 * Which homes a set built by count runs on, in order.
 *
 * The homes the client named on their Performance record come first, in the
 * order they named them, because those are the ones they agreed to pay for.
 * The rest of their site fills the remaining places in the site's own order.
 * Homes with no photo cannot be a card and are skipped.
 */
export function orderHomesForSet<
  Home extends { url: string; imageUrl?: string | null },
>(listings: Home[], onRecordUrls: string[], count: number): Home[] {
  const key = (url: string) => url.trim().toLowerCase().replace(/\/+$/, "");
  const withPhoto = listings.filter((home) => home.imageUrl);
  const byUrl = new Map(withPhoto.map((home) => [key(home.url), home]));
  const picked: Home[] = [];
  const seen = new Set<string>();
  for (const url of onRecordUrls) {
    const home = byUrl.get(key(url));
    if (home && !seen.has(key(home.url))) {
      picked.push(home);
      seen.add(key(home.url));
    }
  }
  for (const home of withPhoto) {
    if (picked.length >= count) break;
    if (!seen.has(key(home.url))) {
      picked.push(home);
      seen.add(key(home.url));
    }
  }
  return picked.slice(0, count);
}

/** The placement a file's pixel ratio fits, by Meta's own crops. */
export type CreativePlacement = "feed" | "square" | "story" | "landscape";

export function placementOf(
  width: number | null | undefined,
  height: number | null | undefined,
): CreativePlacement | null {
  if (!width || !height) return null;
  const ratio = width / height;
  const near = (target: number) => Math.abs(ratio - target) < 0.04;
  if (near(9 / 16)) return "story";
  if (near(4 / 5)) return "feed";
  if (near(1)) return "square";
  if (near(1.91)) return "landscape";
  return null;
}

export type ParsedCreativeFilename = {
  brand: string | null;
  home: string | null;
  /** The format token as written, `StaticA`, `CarouselA`. */
  format: string | null;
  /** The headline drawn on the card, when the name carries one. */
  headline: string | null;
  width: number | null;
  height: number | null;
  placement: CreativePlacement | null;
  /** Everything but the size: what pairs a 4:5 with its 9:16. */
  pairKey: string;
};

/**
 * Brooke's export names, read whole: `LegacyRnR_Villa Soleil_StaticA_Your
 * private wine country villa awaits_1080x1920.png`. Brand, home, format,
 * headline, size. The size is what tells a feed file from its story twin;
 * everything before it is what says they are twins.
 */
export function parseCreativeFilename(
  filename: string,
): ParsedCreativeFilename {
  const stem = filename.replace(/\.[a-z0-9]+$/i, "").trim();
  const parts = stem
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean);
  const size = /^(\d{2,5})x(\d{2,5})$/.exec(parts.at(-1) ?? "");
  const width = size ? Number(size[1]) : null;
  const height = size ? Number(size[2]) : null;
  const body = size ? parts.slice(0, -1) : parts;
  const formatAt = body.findIndex((part) =>
    /^(static|carousel|video)[a-z]?$/i.test(part),
  );
  const home = homeNameFromFilename(filename);
  const format = formatAt >= 0 ? body[formatAt]! : null;
  // The headline is what follows the format, once the slide number is off.
  const after = formatAt >= 0 ? body.slice(formatAt + 1) : [];
  const headline =
    after.filter((part) => !/^slide\s*\d+$/i.test(part)).join(" ") || null;
  return {
    brand: body[0] ?? null,
    home,
    format,
    headline,
    width,
    height,
    placement: placementOf(width, height),
    pairKey: body.join("_").toLowerCase(),
  };
}
