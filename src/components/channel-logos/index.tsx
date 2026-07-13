import type { SVGProps } from "react";

import { cn } from "@/lib/utils";
import { FacebookLogo } from "./facebook";
import { GoogleAdsLogo } from "./google-ads";
import { InstagramLogo } from "./instagram";
import { LinkedInLogo } from "./linkedin";
import { MetaAdsLogo } from "./meta-ads";
import { OpenAIAdsLogo } from "./openai-ads";
import { TikTokLogo } from "./tiktok";
import { XLogo } from "./x";
import { YouTubeLogo } from "./youtube";

type LogoComponent = (props: SVGProps<SVGSVGElement>) => React.ReactElement;

/**
 * platform enum value -> brand SVG logo.
 *
 * To add a new platform logo:
 *   1. drop `src/components/channel-logos/<platform>.tsx` exporting a component
 *      that takes SVGProps and spreads them onto the <svg> (so `className` sizes it),
 *   2. register it here keyed by the `channel_platform` enum value.
 * Unregistered platforms fall back to a two-letter code badge.
 */
export const CHANNEL_LOGOS: Partial<Record<string, LogoComponent>> = {
  instagram: InstagramLogo,
  google_ads: GoogleAdsLogo,
  x: XLogo,
  linkedin: LinkedInLogo,
  tiktok: TikTokLogo,
  facebook: FacebookLogo,
  meta_ads: MetaAdsLogo,
  youtube: YouTubeLogo,
  openai_ads: OpenAIAdsLogo,
  x_ads: XLogo,
  tiktok_ads: TikTokLogo,
};

/** Display names + fallback code badges, keyed by channel_platform enum value. */
export const PLATFORM_META: Record<string, { name: string; code: string }> = {
  instagram: { name: "Instagram", code: "IG" },
  x: { name: "X", code: "X" },
  linkedin: { name: "LinkedIn", code: "LI" },
  facebook: { name: "Facebook", code: "FB" },
  tiktok: { name: "TikTok", code: "TK" },
  youtube: { name: "YouTube", code: "YT" },
  reddit: { name: "Reddit", code: "RD" },
  hackernews: { name: "Hacker News", code: "HN" },
  lobsters: { name: "Lobsters", code: "LO" },
  pinterest: { name: "Pinterest", code: "PIN" },
  threads: { name: "Threads", code: "TH" },
  google_ads: { name: "Google Ads", code: "GA" },
  meta_ads: { name: "Meta Ads", code: "MA" },
  openai_ads: { name: "OpenAI Ads", code: "AI" },
  reddit_ads: { name: "Reddit Ads", code: "RA" },
  linkedin_ads: { name: "LinkedIn Ads", code: "LA" },
  x_ads: { name: "X Ads", code: "XA" },
  tiktok_ads: { name: "TikTok Ads", code: "TA" },
  pinterest_ads: { name: "Pinterest Ads", code: "PA" },
  newsletter: { name: "Newsletter", code: "NL" },
  blog: { name: "Blog", code: "BL" },
  other: { name: "Other", code: "··" },
};

export function platformLabel(platform: string) {
  return PLATFORM_META[platform]?.name ?? platform;
}

/**
 * Renders a platform's brand logo, or a code-badge fallback. Size via `className`
 * (default `size-7`); the SVG fills its box.
 */
export function ChannelLogo({
  platform,
  className = "size-7",
}: {
  platform: string;
  className?: string;
}) {
  const Logo = CHANNEL_LOGOS[platform];
  if (Logo) {
    return <Logo className={cn("shrink-0 rounded-md", className)} />;
  }
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-md text-[10px] font-semibold",
        className,
      )}
    >
      {PLATFORM_META[platform]?.code ?? "··"}
    </span>
  );
}
