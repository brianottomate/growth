"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { orpc } from "@/orpc/client";
import { eligiblePlatformAds, selectPlatformAds } from "@/lib/platform-ad-plan";
import type { Ad, PlatformCampaign } from "@/server/db/ads-schema";
import { posterForMedia } from "@/lib/media-url";

export function PlatformAdSelection({
  pc,
  ads,
  compact = false,
}: {
  pc: PlatformCampaign;
  ads: Ad[];
  compact?: boolean;
}) {
  const router = useRouter();
  const settings = pc.settings ?? {};
  const eligible = eligiblePlatformAds(ads, pc.platform, settings);
  const selected = selectPlatformAds(ads, pc.platform, settings);
  const save = useMutation(
    orpc.ads.setPlatformDraft.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );
  const locked =
    save.isPending || pc.status !== "draft" || Boolean(pc.externalId);
  return (
    <section
      className={compact ? "space-y-3" : "space-y-3 border-t pt-4"}
      aria-label="Included ads"
    >
      {eligible.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">
            {selected.length} of {eligible.length} selected
          </h4>
          {settings.selectedAdIds !== undefined && (
            <Button
              size="sm"
              variant="ghost"
              disabled={locked || settings.selectedAdIds === undefined}
              onClick={() =>
                save.mutate({ platformCampaignId: pc.id, selectedAdIds: null })
              }
            >
              Include all
            </Button>
          )}
        </div>
      )}
      {!compact && (
        <p className="text-xs text-muted-foreground">
          {settings.selectedAdIds === undefined
            ? "New eligible ads are included automatically."
            : "Only the checked ads are included. New ads stay out until selected."}{" "}
          Approval is required before publishing.
        </p>
      )}
      {!eligible.length && (
        <p className="text-sm text-muted-foreground">
          {pc.platform === "google_ads" && !settings.google?.campaignType
            ? "Choose Search or Display in Google settings first."
            : pc.platform === "meta_ads"
              ? "No Meta creative ads are assigned to this campaign."
              : "No compatible ads are assigned to this campaign."}
        </p>
      )}
      <div className="space-y-2">
        {eligible.map((ad) => (
          <label
            key={ad.id}
            className="flex items-start gap-3 rounded-lg border p-3 text-sm"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.some((row) => row.id === ad.id)}
              disabled={locked}
              onChange={(event) =>
                save.mutate({
                  platformCampaignId: pc.id,
                  selectedAdIds: event.target.checked
                    ? [...selected.map((row) => row.id), ad.id]
                    : selected
                        .filter((row) => row.id !== ad.id)
                        .map((row) => row.id),
                })
              }
            />
            {"media" in ad.content && posterForMedia(ad.content.media[0]) && (
              // oxlint-disable-next-line nextjs/no-img-element
              <img
                src={posterForMedia(ad.content.media[0])}
                alt=""
                className="size-16 shrink-0 rounded-md border object-cover"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{ad.name}</span>
              <span className="text-xs text-muted-foreground">
                {ad.type === "text"
                  ? "Responsive search ad"
                  : "media" in ad.content && ad.content.media.length > 1
                    ? `Carousel · ${ad.content.media.length} cards`
                    : "Single image"}
                {ad.status !== "approved" && " · Awaiting approval"}
              </span>
            </span>
          </label>
        ))}
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}
    </section>
  );
}
