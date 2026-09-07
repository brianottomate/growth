"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Eye, Megaphone, PenLine, Replace } from "lucide-react";

import { AdPreviewDialog, type PreviewAd } from "./AdPreviewDialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import { posterForMedia } from "@/lib/media-url";
import type { HomesRun, MediaItem } from "@/server/db/schema";
import { useTRPC } from "@/trpc/react";

type DraftAd = {
  id: string;
  name: string;
  type: "creative" | "text";
  content: unknown;
};

/** Where an ad stands: on this plan only, on a platform paused, or spending. */
export type AdState = "draft" | "pushed" | "live";

const STATE_STYLE: Record<AdState, string> = {
  draft: "bg-muted text-muted-foreground",
  pushed: "bg-sky-500/15 text-sky-300",
  live: "bg-emerald-500/15 text-emerald-300",
};

/**
 * The campaign's ads. Each tile opens the preview, which composes the ad
 * locally rather than depending on a platform round-trip. A creative ad
 * unfolds into its cards, each with the art director's note, a way back into
 * the Studio, and a swap from the library.
 */
export function DraftedAds({
  ads,
  states,
  brandId,
  brandSlug,
  brandName,
  brandLogo,
  landingUrl,
  campaignId,
  homesRun,
  emptyActions,
}: {
  ads: DraftAd[];
  states: Record<string, AdState>;
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  landingUrl: string | null;
  campaignId: string;
  homesRun: HomesRun | null;
  /** Buttons for the empty state, rendered by the page. */
  emptyActions?: React.ReactNode;
}) {
  const [previewing, setPreviewing] = useState<PreviewAd | null>(null);
  const [openAd, setOpenAd] = useState<string | null>(null);

  const toPreview = (ad: DraftAd): PreviewAd => {
    const content = ad.content as {
      headline?: string;
      body?: string;
      linkUrl?: string;
      callToAction?: string;
      media?: Array<{ url: string; thumbnail?: string; type?: string }>;
      headlines?: string[];
      descriptions?: string[];
    };
    return {
      id: ad.id,
      name: ad.name,
      // A text ad has no single headline; its first asset stands in.
      headline: content.headline ?? content.headlines?.[0] ?? null,
      body: content.body ?? content.descriptions?.[0] ?? null,
      linkUrl: content.linkUrl ?? null,
      callToAction: content.callToAction ?? null,
      media: content.media ?? [],
    };
  };

  if (ads.length === 0) {
    return (
      <EmptyState
        compact
        icon={Megaphone}
        title="No ads yet"
        description="Draft them from their homes, or add one by hand."
        actions={emptyActions}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 @3xl:grid-cols-2">
        {ads.map((ad) => {
          const preview = toPreview(ad);
          const first = preview.media[0];
          const isVideo = first?.type === "video";
          // Shared rule: a video's poster or nothing. An <img> pointed at an
          // .mp4 renders nothing and downloads all of it to get there.
          const image = posterForMedia(first);
          const state = states[ad.id] ?? "draft";
          const unfolded = openAd === ad.id;
          const cards = (ad.content as { media?: MediaItem[] }).media ?? [];
          return (
            <div
              key={ad.id}
              className={cn(
                "bg-card overflow-hidden rounded-xl border",
                unfolded && "@3xl:col-span-2",
              )}
            >
              <div className="flex gap-3 p-3">
                <button
                  type="button"
                  onClick={() => setPreviewing(preview)}
                  className="bg-muted group relative h-24 w-20 shrink-0 overflow-hidden rounded-lg border text-left"
                  title="Preview the ad"
                >
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="h-full w-full object-cover" />
                  ) : isVideo && first?.url ? (
                    <video
                      src={first.url}
                      className="h-full w-full bg-black object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center p-2 text-center text-[10px]">
                      Text ad
                    </div>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                    <Eye className="size-4" />
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{preview.headline ?? ad.name}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
                        STATE_STYLE[state],
                      )}
                    >
                      {state}
                    </span>
                  </div>
                  {preview.body ? (
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{preview.body}</p>
                  ) : null}
                  <p className="text-muted-foreground mt-1.5 text-[11px]">
                    {ad.type === "text"
                      ? "Text ad"
                      : cards.length > 1
                        ? `Carousel · ${cards.length} cards`
                        : "Single image"}
                    {preview.callToAction ? ` · ${preview.callToAction}` : ""}
                  </p>
                </div>
                {cards.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOpenAd(unfolded ? null : ad.id)}
                    className="text-muted-foreground hover:text-foreground self-start rounded-md p-1"
                    aria-label={unfolded ? "Fold the cards" : "Show the cards"}
                  >
                    <ChevronDown className={cn("size-4 transition", unfolded && "rotate-180")} />
                  </button>
                ) : null}
              </div>
              {unfolded ? (
                <Cards
                  ad={ad}
                  cards={cards}
                  brandId={brandId}
                  brandSlug={brandSlug}
                  campaignId={campaignId}
                  homesRun={homesRun}
                  locked={state !== "draft"}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {previewing && (
        <AdPreviewDialog
          ad={previewing}
          brandName={brandName}
          brandLogo={brandLogo}
          brandSlug={brandSlug}
          landingUrl={landingUrl}
          open
          onOpenChange={(next) => !next && setPreviewing(null)}
        />
      )}
    </div>
  );
}

/**
 * The cards of one ad. A card the homes run rendered can go back to the Studio
 * with its form filled in; any card can be swapped for a library asset. A
 * pushed ad's cards are read-only here, because the platform holds its copy.
 */
function Cards({
  ad,
  cards,
  brandId,
  brandSlug,
  campaignId,
  homesRun,
  locked,
}: {
  ad: DraftAd;
  cards: MediaItem[];
  brandId: string;
  brandSlug: string;
  campaignId: string;
  homesRun: HomesRun | null;
  locked: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [replacing, setReplacing] = useState<number | null>(null);
  const replace = useMutation(
    trpc.ads.replaceAdMedia.mutationOptions({
      onSuccess: () => {
        toast.success("Card replaced");
        setReplacing(null);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const back = `/app/brands/${brandSlug}/ads/${campaignId}`;

  return (
    <div className="border-t">
      <div className="flex gap-3 overflow-x-auto p-3">
        {cards.map((card, index) => {
          const step = card.assetId
            ? homesRun?.steps.find((row) => row.assetId === card.assetId)
            : undefined;
          const editable = Boolean(card.assetId && card.derivedFrom);
          const studioHref = card.assetId
            ? `/app/compositions?brandId=${encodeURIComponent(brandId)}&asset=${encodeURIComponent(card.assetId)}&adId=${encodeURIComponent(ad.id)}&card=${index}&back=${encodeURIComponent(back)}`
            : null;
          return (
            <div key={`${card.url}-${index}`} className="w-44 shrink-0 space-y-2">
              <div className="bg-muted relative aspect-[4/5] overflow-hidden rounded-lg border">
                {card.type === "video" ? (
                  <video src={card.url} className="size-full object-cover" muted playsInline preload="metadata" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.thumbnail ?? card.url} alt="" className="size-full object-cover" />
                )}
                <span className="absolute top-1.5 left-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {index + 1}
                </span>
              </div>
              {step?.changes && step.changes.length > 0 ? (
                <p className="text-muted-foreground text-[11px] leading-snug">
                  Art director: {step.changes.join("; ")}.
                </p>
              ) : step?.note ? (
                <p className="text-muted-foreground text-[11px] leading-snug">{step.note}</p>
              ) : null}
              {!locked ? (
                <div className="flex items-center gap-1">
                  {editable && studioHref ? (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" asChild>
                      <Link href={studioHref}>
                        <PenLine className="size-3" />
                        Studio
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setReplacing(index)}
                  >
                    <Replace className="size-3" />
                    Replace
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {replacing !== null ? (
        <MediaPickerDialog
          brandId={brandId}
          open
          onOpenChange={(next) => !next && setReplacing(null)}
          existingAssetIds={cards.map((card) => card.assetId).filter((id): id is string => Boolean(id))}
          onPick={(item) => {
            if (!item.assetId) {
              toast.error("Pick something that is in the library");
              return;
            }
            replace.mutate({ adId: ad.id, index: replacing, mediaAssetId: item.assetId });
          }}
        />
      ) : null}
    </div>
  );
}
