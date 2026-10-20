import { z } from "zod";

/**
 * The content of a client performance report. A report is a snapshot: the
 * numbers are copied in when it is written (from Meta, Growth records or by
 * hand) and never re-read from live data, so what a client was sent stays
 * what they see. Derived figures (ROAS, CTR, cost per booking) are computed
 * on read from these counts and never stored.
 */

/** Counts for the whole report window. Money in USD. */
export const performanceReportMetrics = z
  .object({
    spend: z.number().nonnegative(),
    purchaseValue: z.number().nonnegative().optional(),
    bookings: z.number().int().nonnegative().optional(),
    impressions: z.number().int().nonnegative().optional(),
    reach: z.number().int().nonnegative().optional(),
    linkClicks: z.number().int().nonnegative().optional(),
    sitePageViews: z.number().int().nonnegative().optional(),
    addToCart: z.number().int().nonnegative().optional(),
  })
  .strict();
export type PerformanceReportMetrics = z.infer<typeof performanceReportMetrics>;

/** One ad shown in the report, with its numbers for the report window. */
export const performanceReportHighlight = z
  .object({
    /** Growth's mirror of the ad, when it has one. */
    platformAdId: z.string().optional(),
    /** The provider's ad id, so the numbers can be traced to the source. */
    providerAdId: z.string().optional(),
    format: z.string(),
    title: z.string(),
    headline: z.string().optional(),
    note: z.string().optional(),
    /** A stable copy (R2), never a provider CDN URL: those expire. */
    imageUrl: z.url({ protocol: /^https$/ }).optional(),
    spend: z.number().nonnegative(),
    impressions: z.number().int().nonnegative(),
    linkClicks: z.number().int().nonnegative(),
    bookings: z.number().int().nonnegative().optional(),
  })
  .strict();
export type PerformanceReportHighlight = z.infer<
  typeof performanceReportHighlight
>;

export const performanceReportDeliverable = z
  .object({
    name: z.string(),
    status: z.enum(["planned", "in_progress", "delivered"]),
    update: z.string(),
  })
  .strict();
export type PerformanceReportDeliverable = z.infer<
  typeof performanceReportDeliverable
>;

/**
 * Bookings the program earned outside paid ads, e.g. guests who arrived from
 * ChatGPT. Counted from the client's own booking data, so they never overlap
 * the ad platforms' reported bookings. Blended cost per booking divides ad
 * spend by paid plus these.
 */
export const performanceReportOtherBookings = z
  .object({
    label: z.string(), // "ChatGPT"
    bookings: z.number().int().positive(),
    bookingValue: z.number().nonnegative(),
    note: z.string().optional(),
  })
  .strict();
export type PerformanceReportOtherBookings = z.infer<
  typeof performanceReportOtherBookings
>;

/**
 * One ad platform in the client's program and where it stands. The report's
 * `metrics` are the live channels' results; a channel that is not live yet
 * carries its plan instead of numbers.
 */
export const performanceReportChannel = z
  .object({
    platform: z.enum(["meta_ads", "google_ads"]),
    status: z.enum(["live", "paused", "setting_up", "planned"]),
    summary: z.string().optional(),
    /** Short facts about the setup: campaigns, budgets, what is targeted. */
    details: z.array(z.string()).optional(),
  })
  .strict();
export type PerformanceReportChannel = z.infer<typeof performanceReportChannel>;

/**
 * Where the numbers came from. The report is written by whoever pulls the
 * data, so this is the only record of how a figure was produced.
 */
export const performanceReportSource = z
  .object({
    label: z.string(), // "Meta Ads insights"
    via: z.enum(["meta_api", "meta_cli", "growth", "warehouse", "manual"]),
    /** Meta attribution setting, e.g. "7d_click,1d_view". */
    attribution: z.string().optional(),
    /** The conversion counted as a booking, e.g. the brand's purchase event. */
    conversion: z.string().optional(),
    /** Which metric keys this source supplied. */
    covers: z.array(z.string()).optional(),
    fetchedAt: z.iso.datetime(),
    note: z.string().optional(),
  })
  .strict();
export type PerformanceReportSource = z.infer<typeof performanceReportSource>;

export const performanceReportHighlights = z.array(performanceReportHighlight);
export const performanceReportDeliverables = z.array(
  performanceReportDeliverable,
);
export const performanceReportSources = z.array(performanceReportSource);
export const performanceReportOtherBookingsList = z.array(
  performanceReportOtherBookings,
);
export const performanceReportChannels = z
  .array(performanceReportChannel)
  .min(1);

/**
 * A case study is a report written for prospects instead of the client: a
 * before/after comparison, a story, and who approved sharing it. It is sales
 * material, exported as a PDF: the page shows only changes (+32%), never the
 * client's revenue or counts, and the writer stores only the figures it
 * should show. The figures are copied in from whatever the writer pulled
 * (warehouse, Meta, booking data), like the rest of the report.
 *
 * `scope` says what a figure counts, because a case study mixes them:
 * `site` is every booking or visit on the client's own website, `all_channels`
 * also counts OTA and phone bookings from their PMS, `paid` is what an ad
 * platform attributes to the ads.
 */
const caseStudyScope = z.enum(["site", "all_channels", "paid"]);
/** `percent` values are fractions (0.42), like the report's derived rates. */
const caseStudyUnit = z.enum(["count", "usd", "percent", "days"]);
const caseStudyWindow = z
  .object({
    label: z.string().min(1), // "Before Performance"
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  })
  .strict()
  .refine((value) => value.startDate <= value.endDate, {
    message: "Window start must be on or before its end",
  });

export const performanceCaseStudyMeasure = z
  .object({
    label: z.string().min(1), // "Direct bookings"
    scope: caseStudyScope,
    unit: caseStudyUnit,
    before: z.number().nonnegative(),
    after: z.number().nonnegative(),
    /** Lead figures, shown large at the top. */
    featured: z.boolean().optional(),
    note: z.string().optional(),
  })
  .strict();
export type PerformanceCaseStudyMeasure = z.infer<
  typeof performanceCaseStudyMeasure
>;

/** Weekly values, so the page can show the shape around the change. */
export const performanceCaseStudySeries = z
  .object({
    label: z.string().min(1), // "Site sessions per week"
    scope: caseStudyScope,
    unit: caseStudyUnit,
    points: z
      .array(
        z
          .object({
            start: z.iso.date(), // first day of the week
            value: z.number().nonnegative(),
            partial: z.boolean().optional(),
          })
          .strict(),
      )
      .min(2),
  })
  .strict();
export type PerformanceCaseStudySeries = z.infer<
  typeof performanceCaseStudySeries
>;

export const performanceCaseStudy = z
  .object({
    headline: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1),
    /** What the story is about: the ad program, or the website platform. */
    product: z.enum(["performance", "wanderos"]).default("performance"),
    /** The report's ad highlights, shown as a creative section. */
    showCreative: z.boolean().default(false),
    /** Null until the client agrees; the page then says approval is required. */
    approval: z
      .object({
        approvedBy: z.string().min(1),
        approvedOn: z.iso.date(),
        scope: z.enum(["sales", "public"]),
      })
      .strict()
      .nullable(),
    heroImageUrl: z.url({ protocol: /^https$/ }).optional(),
    heroCaption: z.string().optional(),
    comparison: z
      .object({
        before: caseStudyWindow,
        after: caseStudyWindow,
        measures: z.array(performanceCaseStudyMeasure).min(1),
      })
      .strict()
      .refine((value) => value.before.endDate < value.after.startDate, {
        message: "The before window must end before the after window starts",
      }),
    series: z.array(performanceCaseStudySeries).default([]),
    /** Moments drawn on the weekly charts: launches, setting changes. */
    events: z
      .array(
        z.object({ date: z.iso.date(), label: z.string().min(1) }).strict(),
      )
      .default([]),
    sections: z
      .array(
        z
          .object({
            heading: z.string().min(1),
            body: z.string().min(1),
            imageUrl: z.url({ protocol: /^https$/ }).optional(),
            imageCaption: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export type PerformanceCaseStudy = z.infer<typeof performanceCaseStudy>;

/** Every change is relative to before, rates included (0.46% → 0.71% is +54%). */
export function caseStudyChange(measure: PerformanceCaseStudyMeasure) {
  if (!measure.before) return "New";
  const rounded = Math.round(
    ((measure.after - measure.before) / measure.before) * 100,
  );
  return `${rounded >= 0 ? "+" : "−"}${Math.abs(rounded)}%`;
}

/** Every image a case study shows, for the stable-URL check and the media proxy. */
export function caseStudyImageUrls(caseStudy: PerformanceCaseStudy | null) {
  if (!caseStudy) return [];
  return [
    caseStudy.heroImageUrl,
    ...caseStudy.sections.map((section) => section.imageUrl),
  ].filter((url): url is string => Boolean(url));
}

/** A rate, or null when the denominator is missing or zero. */
export function ratio(
  numerator: number | undefined,
  denominator: number | undefined,
) {
  return numerator === undefined || !denominator
    ? null
    : numerator / denominator;
}

/** Editable content. Publication creates a separate, frozen share. */
export const performanceReportContent = z
  .object({
    periodLabel: z.string().trim().min(1).max(200),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    channels: performanceReportChannels,
    metrics: performanceReportMetrics,
    otherBookings: performanceReportOtherBookingsList.default([]),
    highlights: performanceReportHighlights.default([]),
    deliverables: performanceReportDeliverables.default([]),
    sources: performanceReportSources.min(1),
    narrative: z.string().nullable().default(null),
    recommendations: z.string().nullable().default(null),
    caseStudy: performanceCaseStudy.nullable().default(null),
  })
  .strict()
  .refine((value) => value.startDate <= value.endDate, {
    message: "Start date must be on or before end date",
  });
export type PerformanceReportContent = z.infer<typeof performanceReportContent>;
export const performanceReportSnapshot = performanceReportContent.safeExtend({
  clientName: z.string(),
  status: z.enum(["draft", "published"]),
  publishedAt: z.iso.datetime().nullable(),
});
export type PerformanceReportSnapshot = z.infer<
  typeof performanceReportSnapshot
>;
export const savePerformanceReportSchema = z.object({
  brandId: z.string().min(1),
  id: z.string().min(1).optional(),
  cycleId: z.string().nullable().default(null),
  content: performanceReportContent,
});
