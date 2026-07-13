import type { ChannelPlatform } from "@/server/db/schema";

/**
 * Paid-media platforms the workspace can plan against or add as brand channels.
 *
 * Keep this client-safe catalog as the UI source of truth. Provider integrations
 * can still be partial: a channel may be tracked manually before it is synced.
 */
export const AD_PLATFORM_OPTIONS = [
  { value: "meta_ads", label: "Meta Ads", shortLabel: "Meta" },
  { value: "google_ads", label: "Google Ads", shortLabel: "Google" },
  { value: "openai_ads", label: "OpenAI Ads", shortLabel: "OpenAI" },
  { value: "reddit_ads", label: "Reddit Ads", shortLabel: "Reddit" },
  { value: "linkedin_ads", label: "LinkedIn Ads", shortLabel: "LinkedIn" },
  { value: "x_ads", label: "X Ads", shortLabel: "X" },
  { value: "tiktok_ads", label: "TikTok Ads", shortLabel: "TikTok" },
  { value: "pinterest_ads", label: "Pinterest Ads", shortLabel: "Pinterest" },
] as const satisfies readonly {
  value: ChannelPlatform;
  label: string;
  shortLabel: string;
}[];

export const AD_PLATFORM_VALUES = AD_PLATFORM_OPTIONS.map(
  ({ value }) => value,
) as [ChannelPlatform, ...ChannelPlatform[]];

export const AD_PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  AD_PLATFORM_OPTIONS.map(({ value, label }) => [value, label]),
);

export const AD_PLATFORM_SHORT_LABELS: Record<string, string> =
  Object.fromEntries(
    AD_PLATFORM_OPTIONS.map(({ value, shortLabel }) => [value, shortLabel]),
  );
