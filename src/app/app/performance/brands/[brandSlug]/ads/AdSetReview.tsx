"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, Sparkles } from "lucide-react";

import { AD_MOCK_SURFACES, AdMock, type AdMockSurface } from "@/components/ad-mock";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

export type ReviewCard = { url: string; thumbnail: string | null };

export type ReviewAd = {
  id: string;
  name: string;
  status: "drawn" | "kept" | "approved";
  headline: string;
  body: string;
  callToAction: string | null;
  linkUrl: string | null;
  homeName: string | null;
  cards: ReviewCard[];
};

const panel = "bg-card overflow-hidden rounded-2xl border";
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";

/** What each ad is, read off its own shape rather than stored twice. */
function kindOf(ad: ReviewAd) {
  if (ad.cards.length <= 1) return "Static";
  return ad.homeName ? "Carousel" : "Portfolio";
}

/**
 * The set as it will run, one ad at a time, before any of it reaches Meta.
 *
 * This is the surface the whole draft layer exists for: the primary text
 * beside the cards it runs with, every card inspectable, and a status you
 * move by hand. Approving is not a push. Nothing here talks to a platform.
 */
export function AdSetReview({
  brandName,
  brandLogo,
  ads,
  canBuild,
  onBuild,
  building,
}: {
  brandName: string;
  brandLogo: string | null;
  ads: ReviewAd[];
  canBuild: boolean;
  onBuild: () => void;
  building: boolean;
}) {
  const [surface, setSurface] = useState<AdMockSurface>("instagram");

  const approved = ads.filter((ad) => ad.status === "approved").length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={sectionLabel}>
          The set · {ads.length}
          {ads.length > 0 ? ` · ${approved} approved` : ""}
        </p>
        <div className="flex items-center gap-3">
          {ads.length > 0 ? (
            <Tabs
              value={surface}
              onValueChange={(value) => setSurface(value as AdMockSurface)}
            >
              <TabsList>
                {AD_MOCK_SURFACES.map((option) => (
                  <TabsTrigger key={option.id} value={option.id} className="text-xs">
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}
          <Button
            size="sm"
            disabled={!canBuild || building}
            onClick={onBuild}
            className="h-7 rounded-full px-3 text-[11.5px]"
          >
            {building ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Sparkles className="size-3" />
            )}
            {ads.length > 0 ? "Rebuild the set" : "Build the set"}
          </Button>
        </div>
      </div>

      {ads.length === 0 ? (
        <p className={cn(panel, "text-muted-foreground px-4 py-8 text-center text-xs")}>
          {canBuild
            ? "Nothing drafted yet."
            : "Pick the homes the ads run on first."}
        </p>
      ) : (
        <ul className="space-y-4">
          {ads.map((ad) => (
            <AdRow
              key={ad.id}
              ad={ad}
              surface={surface}
              brandName={brandName}
              brandLogo={brandLogo}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AdRow({
  ad,
  surface,
  brandName,
  brandLogo,
}: {
  ad: ReviewAd;
  surface: AdMockSurface;
  brandName: string;
  brandLogo: string | null;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [card, setCard] = useState(0);
  const [body, setBody] = useState(ad.body);
  const [headline, setHeadline] = useState(ad.headline);

  const setStatus = useMutation(
    trpc.ads.setAdStatus.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );
  const setCopy = useMutation(
    trpc.ads.setAdCopy.mutationOptions({
      onSuccess: () => {
        toast.success("Copy saved.");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const dirty = body !== ad.body || headline !== ad.headline;
  const busy = setStatus.isPending || setCopy.isPending;

  return (
    <li className={cn(panel, "p-4")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">
            {ad.homeName ?? brandName}
          </p>
          <p className="text-muted-foreground truncate text-[11px]">
            {kindOf(ad)} · {ad.cards.length}{" "}
            {ad.cards.length === 1 ? "card" : "cards"} · {ad.name}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(["drawn", "kept", "approved"] as const).map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy}
              onClick={() => setStatus.mutate({ adId: ad.id, status })}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10.5px] font-medium capitalize transition disabled:opacity-40",
                ad.status === status
                  ? status === "approved"
                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                    : "border-sky-400 bg-sky-500/20 text-sky-200"
                  : "text-muted-foreground hover:text-foreground hover:border-white/30",
              )}
            >
              {ad.status === status && status === "approved" ? (
                <Check className="mr-0.5 inline size-3 align-[-2px]" />
              ) : null}
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-4 @2xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="flex justify-center @2xl:justify-start">
          <AdMock
            surface={surface}
            brandName={brandName}
            brandLogo={brandLogo}
            body={ad.body}
            headline={ad.headline}
            link={ad.linkUrl}
            callToAction={ad.callToAction}
            media={ad.cards.map((item) => ({
              url: item.url,
              thumbnail: item.thumbnail,
              type: "image",
            }))}
            card={card}
            onCard={ad.cards.length > 1 ? setCard : undefined}
            className="w-full max-w-80"
          />
        </div>

        <div className="space-y-2">
          <div className="space-y-1">
            <p className={sectionLabel}>Headline</p>
            <input
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
              maxLength={60}
              className="bg-muted/40 h-8 w-full rounded-lg border px-2.5 text-xs outline-none focus:ring-2 focus:ring-sky-400/40"
            />
          </div>
          <div className="space-y-1">
            <p className={sectionLabel}>Primary text</p>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={9}
              className="bg-muted/40 w-full resize-y rounded-lg border px-2.5 py-2 text-xs leading-5 outline-none focus:ring-2 focus:ring-sky-400/40"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              disabled={!dirty || busy}
              onClick={() => setCopy.mutate({ adId: ad.id, headline, body })}
              className="h-7 rounded-full px-3 text-[11.5px]"
            >
              Save copy
            </Button>
            {dirty ? (
              <button
                type="button"
                onClick={() => {
                  setBody(ad.body);
                  setHeadline(ad.headline);
                }}
                className="text-muted-foreground hover:text-foreground text-[11.5px]"
              >
                Revert
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {ad.cards.length > 1 ? (
        <ul className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          {ad.cards.map((item, index) => (
            <li key={`${ad.id}-${index}`}>
              <button
                type="button"
                onClick={() => setCard(index)}
                title={`Card ${index + 1}`}
                className={cn(
                  "block overflow-hidden rounded-lg border transition",
                  card === index
                    ? "border-sky-400 ring-2 ring-sky-400/40"
                    : "hover:border-white/30",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnail ?? item.url}
                  alt={`Card ${index + 1}`}
                  loading="lazy"
                  className="size-16 object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
