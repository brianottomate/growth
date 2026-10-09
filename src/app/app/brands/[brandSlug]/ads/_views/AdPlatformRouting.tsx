"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";

import { adSupportsPlatform } from "@/lib/platform-ad-plan";
import type {
  AdContent,
  PlatformCampaignSettings,
} from "@/server/db/ads-schema";
import { cn } from "@/components/ui/lib/utils";
import { adPlatformSpec, adRoutesTo } from "@/lib/ad-platforms";
import { orpc } from "@/orpc/client";
import type { ChannelPlatform } from "@/server/db/schema";

/**
 * Which of the campaign's planned platforms this idea runs on. All lit is the
 * default and stores nothing; switching one off narrows the idea to the rest.
 */
export function AdPlatformRouting({
  adId,
  platforms,
  planned,
  locked,
  type,
  content,
  settings,
}: {
  adId: string;
  platforms: ChannelPlatform[] | null;
  planned: ChannelPlatform[];
  locked: boolean;
  type: "text" | "creative";
  content: AdContent;
  settings: Partial<Record<ChannelPlatform, PlatformCampaignSettings>>;
}) {
  const router = useRouter();
  const save = useMutation(
    orpc.ads.setAdPlatforms.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );
  const compatible = planned.filter((platform) => {
    const features = adPlatformSpec(platform)?.features;
    return (
      (type === "text" ? features?.textAds : features?.creativeAds) &&
      adSupportsPlatform({ type, content }, platform, settings[platform] ?? {})
    );
  });
  if (!planned.length) return null;

  const toggle = (platform: ChannelPlatform) => {
    const on = compatible.filter((p) => adRoutesTo(platforms, p));
    const next = on.includes(platform)
      ? on.filter((p) => p !== platform)
      : [...on, platform];
    if (next.length === 0) {
      toast.error("An ad needs at least one platform");
      return;
    }
    save.mutate({
      adId,
      platforms: next.length === planned.length ? null : next,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {planned.map((platform) => {
        const supported = compatible.includes(platform);
        const on = supported && adRoutesTo(platforms, platform);
        const explanation = !supported
          ? platform === "meta_ads" && type === "text"
            ? "Meta requires creative media; this is a responsive Search ad."
            : platform === "google_ads" &&
                settings.google_ads?.google?.campaignType === "search"
              ? "This Google plan is Search and accepts text ads only."
              : "This ad format is not supported by this platform plan."
          : locked
            ? "Platform routing is locked for delivered ads."
            : on
              ? "Included in this platform plan"
              : "Excluded from this platform plan";
        return (
          <button
            key={platform}
            type="button"
            disabled={
              !supported ||
              locked ||
              save.isPending ||
              (compatible.length === 1 && on)
            }
            aria-pressed={on}
            title={explanation}
            aria-label={`${adPlatformSpec(platform)?.shortLabel ?? platform}: ${explanation}`}
            onClick={() => toggle(platform)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition disabled:cursor-default",
              on
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-transparent text-muted-foreground enabled:hover:border-foreground/40 enabled:hover:text-foreground",
            )}
          >
            {adPlatformSpec(platform)?.shortLabel ?? platform}
          </button>
        );
      })}
    </div>
  );
}
