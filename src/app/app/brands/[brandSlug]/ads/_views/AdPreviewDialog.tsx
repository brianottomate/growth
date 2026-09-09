"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  AD_MOCK_SURFACES,
  AdMock,
  type AdMockMedia,
  type AdMockSurface,
} from "@/components/ad-mock";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTRPC } from "@/trpc/react";

export type PreviewAd = {
  id: string;
  name: string;
  headline: string | null;
  body: string | null;
  linkUrl: string | null;
  callToAction: string | null;
  media: AdMockMedia[];
};

/**
 * How a drafted ad will look, rendered locally.
 *
 * The same idea as the content post's platform previews: composed from the
 * draft we hold, so it is instant, works before any platform connection, and
 * covers the story crop Meta cannot render pre-push. Meta's own render stays
 * one click away for the feed shapes, since only it is authoritative.
 */
export function AdPreviewDialog({
  ad,
  brandName,
  brandLogo,
  brandSlug,
  landingUrl,
  open,
  onOpenChange,
}: {
  ad: PreviewAd;
  brandName: string;
  brandLogo: string | null;
  brandSlug: string;
  landingUrl: string | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const trpc = useTRPC();
  const [surface, setSurface] = useState<AdMockSurface>("facebook");
  const [card, setCard] = useState(0);
  const [showMeta, setShowMeta] = useState(false);

  const destinations = useQuery(
    trpc.ads.destinations.queryOptions(
      { brandSlug, platform: "meta" },
      { enabled: open && showMeta },
    ),
  );
  const destination = destinations.data?.destinations[0];
  const metaPreview = useMutation(trpc.ads.previewAd.mutationOptions());

  const isVideo = ad.media[0]?.type === "video";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ad.name}</DialogTitle>
          <DialogDescription>
            Composed from the draft — instant, and nothing reaches a platform.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {AD_MOCK_SURFACES.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={surface === option.id ? "default" : "outline"}
              onClick={() => setSurface(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="flex justify-center py-2">
          <AdMock
            surface={surface}
            brandName={brandName}
            brandLogo={brandLogo}
            body={ad.body}
            headline={ad.headline ?? ad.name}
            link={ad.linkUrl ?? landingUrl}
            callToAction={ad.callToAction}
            media={ad.media}
            card={card}
            onCard={setCard}
          />
        </div>

        <div className="border-t pt-3">
          {!showMeta ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowMeta(true)}
            >
              Check against Meta&apos;s own render
            </Button>
          ) : destinations.isPending ? (
            <p className="text-muted-foreground text-xs">
              Finding the allowlisted destination…
            </p>
          ) : !destination ? (
            <p className="text-muted-foreground text-xs">
              No allowlisted Meta destination yet — connect and allow an ad
              account on the setup page.
            </p>
          ) : isVideo ? (
            <p className="text-muted-foreground text-xs">
              Meta cannot render a video draft before it is pushed. The local
              preview above is the shape; push paused to see the real thing.
            </p>
          ) : metaPreview.data ? (
            <div className="flex max-h-[50vh] gap-3 overflow-auto">
              {metaPreview.data.previewUrls.map((src, index) => (
                <iframe
                  key={src}
                  src={src}
                  title={metaPreview.data.formats[index] ?? "Meta preview"}
                  className="h-[520px] w-full min-w-72 rounded-lg border bg-white"
                  sandbox="allow-scripts allow-same-origin"
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                loading={metaPreview.isPending}
                onClick={() =>
                  metaPreview.mutate({
                    adId: ad.id,
                    connectionAccountId: destination.connectionAccountId,
                    adAccountId: destination.adAccountId,
                  })
                }
              >
                Render on Meta
              </Button>
              <span className="text-muted-foreground text-xs">
                Feed placements only before a push.
              </span>
            </div>
          )}
          {metaPreview.error && (
            <p className="mt-2 text-xs text-red-300">
              {metaPreview.error.message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
