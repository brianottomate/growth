"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";

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
}: {
  adId: string;
  platforms: ChannelPlatform[] | null;
  planned: ChannelPlatform[];
  locked: boolean;
}) {
  const router = useRouter();
  const save = useMutation(
    orpc.ads.setAdPlatforms.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );
  if (planned.length < 2) return null;

  const toggle = (platform: ChannelPlatform) => {
    const on = planned.filter((p) => adRoutesTo(platforms, p));
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
    <div className="mb-2 flex flex-wrap items-center gap-1">
      {planned.map((platform) => {
        const on = adRoutesTo(platforms, platform);
        return (
          <button
            key={platform}
            type="button"
            disabled={locked || save.isPending}
            aria-pressed={on}
            onClick={() => toggle(platform)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition disabled:opacity-50",
              on
                ? "border-foreground/40 bg-foreground/10 text-foreground"
                : "text-muted-foreground line-through hover:text-foreground",
            )}
          >
            {adPlatformSpec(platform)?.shortLabel ?? platform}
          </button>
        );
      })}
    </div>
  );
}
