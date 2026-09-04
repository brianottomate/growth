/**
 * Performance+ ad conventions — the house style for sponsored placement builds.
 *
 * These are Brooke's conventions, lifted from the first live Performance+
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
   * Budget lives on the ad set, never the campaign. A Performance+ campaign
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

/**
 * `OSPERF+AWAY+STAY_PROSPECTING_PURCHASES`
 *
 * The `OSPERF+` prefix is what finance filters spend on, so it leads. Period is
 * optional and off by default to match the live build; see the playbook for why
 * a recurring product probably wants it on.
 */
export function performanceCampaignName(input: {
  customer: string;
  strategy?: string;
  objective?: string;
  period?: string;
}): string {
  return [
    `OSPERF+${upperSnake(input.customer)}`,
    upperSnake(input.strategy ?? "PROSPECTING"),
    upperSnake(input.objective ?? "PURCHASES"),
    input.period ? upperSnake(input.period) : null,
  ]
    .filter(Boolean)
    .join("_");
}

/**
 * The name a new campaign draft starts with, so every draft is born in the
 * house convention instead of whatever was typed in the moment. A paying
 * client gets the finance-filterable `OSPERF+` form; Wander's own brands get
 * the same shape without the prefix, `WANDER_PROSPECTING_PURCHASES`. Always
 * editable in the form; this is the default, not a rule.
 */
export function campaignDraftName(input: {
  brandName: string;
  isClient: boolean;
}): string {
  if (input.isClient) {
    return performanceCampaignName({ customer: input.brandName });
  }
  return [upperSnake(input.brandName) || "WANDER", "PROSPECTING", "PURCHASES"].join("_");
}

/** `LOOKALIKE_SEEDLIST`, `PROSPECTING_LIST`, `THIRD_PARTY_INTENT`. */
export function performanceAdSetName(kind: PerformanceAudienceKind): string {
  const names: Record<PerformanceAudienceKind, string> = {
    lookalike_booker_seed: "LOOKALIKE_SEEDLIST",
    prospecting_list: "PROSPECTING_LIST",
    third_party_intent: "THIRD_PARTY_INTENT",
  };
  return names[kind];
}

/** Property slot letters, so ad names sort by property: A, B, … Z, AA. */
export function propertySlot(index: number): string {
  if (index < 0) throw new Error("property index must be >= 0");
  let slot = "";
  let n = index;
  do {
    slot = String.fromCharCode(65 + (n % 26)) + slot;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return slot;
}

export type PerformanceAdFormat = "Static" | "Carousel";

/**
 * `PropertyB_Static_Wander Pawleys Island`
 *
 * Slot first so every asset for one property sorts together, format second so
 * the pair is adjacent. The property name is kept human-readable rather than
 * slugged — this string is read in Ads Manager, not parsed.
 */
export function performanceAdName(input: {
  index: number;
  format: PerformanceAdFormat;
  propertyName: string;
}): string {
  return `Property${propertySlot(input.index)}_${input.format}_${input.propertyName.trim()}`;
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
      name: performanceAdName({ index, format, propertyName: property.name }),
      kind: format === "Static" ? ("static" as const) : ("carousel" as const),
      propertyIndex: index,
      linkUrl: property.url,
    })),
  );
  return [
    ...perProperty,
    {
      name: "AllProperties_Carousel",
      kind: "all_properties_carousel",
      propertyIndex: null,
      linkUrl: null,
    },
    {
      name: `Catalog Ads_All${input.properties.length}properties_${input.customer.trim()}`,
      kind: "catalog",
      propertyIndex: null,
      linkUrl: null,
    },
  ];
}
