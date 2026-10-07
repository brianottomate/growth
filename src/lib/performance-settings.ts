// A Performance client's settings page, as fields a page can lay out.
// Client-safe. The derived tiles are read off rows the app already keeps;
// the settings tiles are the brand's `performanceSettings`, written by the
// agent (or a person through it) and filled from the intake when applied.
// The layout follows Micaela's tracker sheet, column for column.

import type { PerformanceSettings } from "@/server/db/brand-schema";

export type SettingsKey = Exclude<
  keyof PerformanceSettings,
  "updatedAt" | "updatedBy" | "updatedFrom"
>;

export type SettingsField =
  | {
      key: string;
      label: string;
      source: "derived";
      /** Where the value is read from, shown small beside the label. */
      from: string;
    }
  | {
      key: SettingsKey;
      label: string;
      source: "setting";
      kind: "url" | "text" | "number" | "money" | "date";
    };

/** The tracker sheet's columns first, in its order, then the intake's settings. */
export const SETTINGS_FIELDS: SettingsField[] = [
  { key: "paidFee", label: "Paid fee", source: "derived", from: "cycle" },
  {
    key: "effectiveDate",
    label: "Effective date",
    source: "setting",
    kind: "date",
  },
  { key: "terms", label: "Terms", source: "setting", kind: "text" },
  { key: "endDate", label: "End date", source: "setting", kind: "date" },
  {
    key: "siteLive",
    label: "WanderOS site live",
    source: "setting",
    kind: "text",
  },
  {
    key: "agreedAdSpend",
    label: "Agreed ad spend",
    source: "setting",
    kind: "money",
  },
  {
    key: "paidAdSpend",
    label: "Paid ad spend",
    source: "derived",
    from: "cycle · Meta",
  },
  {
    key: "onboardingLink",
    label: "Onboarding link",
    source: "derived",
    from: "intake",
  },
  {
    key: "fbConnection",
    label: "FB connection",
    source: "derived",
    from: "intake",
  },
  {
    key: "catalogCreativeUrl",
    label: "Catalog ad creative",
    source: "setting",
    kind: "url",
  },
  {
    key: "carouselCreativeUrl",
    label: "Carousel ad creative",
    source: "setting",
    kind: "url",
  },
  {
    key: "heroCreativeUrl",
    label: "Hero ad creative",
    source: "setting",
    kind: "url",
  },
  { key: "adCopiesUrl", label: "Ad copies", source: "setting", kind: "url" },
  { key: "adsLive", label: "Ads live", source: "derived", from: "campaigns" },
  { key: "cpb", label: "CPB", source: "derived", from: "spend ÷ bookings" },
  {
    key: "dedicatedNewsletter",
    label: "Dedicated newsletter",
    source: "setting",
    kind: "text",
  },
  { key: "influencer", label: "Influencer", source: "setting", kind: "text" },
  {
    key: "socialMediaPosts",
    label: "Social media posts",
    source: "setting",
    kind: "text",
  },
  { key: "bookings", label: "Bookings", source: "setting", kind: "number" },
  {
    key: "reportEmails",
    label: "Report emails",
    source: "setting",
    kind: "text",
  },
  {
    key: "invoiceEmail",
    label: "Invoice email",
    source: "setting",
    kind: "text",
  },
  {
    key: "ugcPermission",
    label: "UGC permission",
    source: "setting",
    kind: "text",
  },
  {
    key: "creativeDriveUrl",
    label: "Client creative folder",
    source: "setting",
    kind: "url",
  },
  {
    key: "guestListDriveUrl",
    label: "Guest list",
    source: "setting",
    kind: "url",
  },
];

/** Where the sheet's columns end and the intake's settings begin. */
export const FIRST_INTAKE_SETTING: SettingsKey = "reportEmails";

export type SettingsDerived = {
  /** Whole dollars the client pays a month: the newest cycle, else the contract. */
  paidFee: number | null;
  /** When this month's fee and media invoices cleared; null while open. */
  feePaidAt: Date | null;
  mediaPaidAt: Date | null;
  /** Whole dollars of media a month, from the newest cycle or the intake. */
  mediaBudget: number | null;
  clientMediaContribution?: number | null;
  /** What Meta reports spent across the brand's campaigns, in dollars. */
  actualSpend: number;
  onboardingLink: string | null;
  fbConnection: "verified" | "claimed" | "none";
  adsLive: "live" | "paused" | "draft" | "none";
  /** Conversions Meta reports across the brand's campaigns. */
  platformBookings: number;
};

/** Bookings the sheet counts: the platform's number, else what was set by hand. */
export function settingsBookings(
  derived: SettingsDerived,
  settings: PerformanceSettings | null,
) {
  if (derived.platformBookings > 0) return derived.platformBookings;
  return settings?.bookings ?? null;
}

/** Cost per booking in whole dollars, or null when there is nothing to divide. */
export function costPerBooking(spend: number, bookings: number | null) {
  if (!bookings || bookings <= 0 || spend <= 0) return null;
  return Math.round(spend / bookings);
}

/** "2026-09-02" as "Sep 2, 2026"; anything else as written. */
export function trackerDate(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
