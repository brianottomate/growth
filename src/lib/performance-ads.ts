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
    performanceNamePrefix({ brandName: input.customer, isClient: input.isClient ?? true }),
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
export function audienceLabelForKind(kind: PerformanceAudienceKind): PerformanceAudienceLabel {
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
export function audienceLabelForPlan(audience: { type: string } | null | undefined): PerformanceAudienceLabel {
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
    performanceNamePrefix({ brandName: input.customer, isClient: input.isClient ?? true }),
    input.audience,
    states.length > 0 ? states.join("+") : "US",
  ].join("_");
}

export type PerformanceAdFormat = "Static" | "Carousel" | "Video" | "Influencer Video";

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
    performanceNamePrefix({ brandName: input.customer, isClient: input.isClient ?? true }),
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
      name: performanceAdName({ customer: input.customer, format, propertyName: property.name }),
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
