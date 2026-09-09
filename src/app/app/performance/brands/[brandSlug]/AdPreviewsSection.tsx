"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Megaphone, MessageSquare, X } from "lucide-react";

import {
  AD_MOCK_SURFACES,
  AdMock,
  type AdMockSurface,
} from "@/components/ad-mock";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { sendAssistantIntent } from "@/lib/assistant-events";
import type { AdPreviewCard } from "@/server/services/brand-ad-previews.service";
import { useTRPC } from "@/trpc/react";

// The section's label and panel match `_components.tsx`, which cannot be
// imported here: it reads the desk service, and this is a client component.
const panel = "bg-card overflow-hidden rounded-2xl border";
const pill = "rounded-full";
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase">
      {children}
    </p>
  );
}

/**
 * What the brand's ads will look like, before there is a campaign: the cards
 * kept on the brand, each drawn inside a feed mock with the brand's name,
 * Sponsored, their domain and the button. One surface at a time; the toggle
 * re-crops every card together, which is how the same creative is compared
 * across placements.
 */
export function AdPreviewsSection({
  brandId,
  brandSlug,
  brandName,
  brandLogo,
  website,
  cards,
}: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  website: string | null;
  cards: AdPreviewCard[];
}) {
  const [surface, setSurface] = useState<AdMockSurface>("facebook");
  const trpc = useTRPC();
  const router = useRouter();
  const remove = useMutation(
    trpc.brand.removeAdPreview.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Removed from the previews; the card stays in the library",
        );
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const back = `/app/performance/brands/${brandSlug}`;
  const designInChat = (
    <Button
      size="sm"
      variant="outline"
      className="h-7 rounded-full px-3 text-[11.5px]"
      onClick={() =>
        sendAssistantIntent({
          type: "design_ad_preview",
          brandId,
          brandName,
          visibleText: `Design an ad preview for ${brandName}: one of their homes on the house card, copy in their voice, judged, and kept on the brand.`,
        })
      }
    >
      <MessageSquare className="size-3" />
      Design in chat
    </Button>
  );

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>
          Ad previews{cards.length ? ` · ${cards.length}` : ""}
        </SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          {cards.length > 0 ? (
            <div className="flex items-center gap-0.5 rounded-full border p-0.5">
              {AD_MOCK_SURFACES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSurface(option.id)}
                  aria-pressed={surface === option.id}
                  className={cn(
                    pill,
                    "px-2.5 py-0.5 text-[11px] transition-colors",
                    surface === option.id
                      ? "bg-foreground text-background font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {cards.length === 0 ? (
        <div className={panel}>
          <EmptyState
            compact
            icon={Megaphone}
            title="No ad previews yet"
            description="What their ads will look like before there is a campaign. Open a photo in the library or one of their homes above and choose “Design an ad from this photo”; the card you freeze lands here."
            actions={designInChat}
          />
        </div>
      ) : (
        <ul className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
          {cards.map((card) => (
            <li key={card.assetId} className="flex flex-col items-center gap-2">
              <AdMock
                surface={surface}
                brandName={brandName}
                brandLogo={brandLogo}
                body={card.body}
                headline={card.headline || brandName}
                link={card.homeUrl ?? website}
                callToAction={card.callToAction}
                media={[
                  {
                    url: card.url,
                    thumbnail: card.thumbnailUrl,
                    type: "image",
                  },
                ]}
                className={
                  surface === "story" ? "w-full max-w-60" : "w-full max-w-80"
                }
              />
              <div className="text-muted-foreground flex w-full max-w-80 items-center justify-between gap-2 text-[11px]">
                <span className="truncate">
                  {card.templateLabel} · {card.formatLabel}
                  {card.judged ? " · judged" : ""}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/app/compositions?brandId=${encodeURIComponent(brandId)}&asset=${encodeURIComponent(card.assetId)}&adPreview=1&back=${encodeURIComponent(back)}`}
                    className="text-sky-300 hover:underline"
                  >
                    Studio
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      remove.mutate({ id: brandId, assetId: card.assetId })
                    }
                    disabled={remove.isPending}
                    className="hover:text-foreground inline-flex items-center gap-0.5 disabled:opacity-50"
                    aria-label="Remove from the previews"
                    title="Remove from the previews. The card stays in the library."
                  >
                    <X className="size-3" />
                  </button>
                </span>
              </div>
            </li>
          ))}
          <li className="flex items-center justify-center">
            {cards.length < 8 ? designInChat : null}
          </li>
        </ul>
      )}
    </section>
  );
}
