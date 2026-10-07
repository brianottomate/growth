"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Logo } from "@wandercom/design-system-web/ui/logo";

import { CompactAdMock, domainOf } from "@/components/ad-mock";
import { Button } from "@/components/ui/button";
import type { AdPreviewAd } from "@/lib/ad-preview";
import type { AdPreviewPage } from "@/server/services/ad-preview.service";

import { CatalogCollectionPreview } from "@/app/app/performance/clients/[brandSlug]/catalog/CatalogPreview";

import { EXPORT_HIDE, PngExport } from "./PngExport";

export function AdPreviewBoard({
  token,
  preview,
}: {
  token: string;
  preview: AdPreviewPage;
}) {
  const ads = preview.campaign?.ads ?? [];
  const filename = `${preview.brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-ads`;
  return (
    <div
      data-theme="light"
      data-export-root
      className="min-h-screen bg-surface-primary text-primary print:bg-white"
    >
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo variant="logo" className="h-6 w-auto" />
            <span className="border-l border-border pl-3 text-sm text-muted-foreground">
              Ads for {preview.brandName}
            </span>
          </div>
          <div {...{ [EXPORT_HIDE]: "" }} className="flex gap-2 print:hidden">
            <PngExport token={token} filename={filename} />
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" />
              Save as PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
        {preview.campaign && (
          <div className="space-y-6">
            {/* Campaign names are internal (META_PERF+…); the client sees theirs. */}
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">
                {preview.brandName} ads
              </h1>
              <p className="text-sm text-muted-foreground">
                Campaign · {ads.length} {ads.length === 1 ? "ad" : "ads"}
              </p>
              {preview.campaign.unavailableAds > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {preview.campaign.unavailableAds} approved{" "}
                  {preview.campaign.unavailableAds === 1
                    ? "ad has"
                    : "ads have"}{" "}
                  no shareable preview artwork yet.
                </p>
              )}
            </div>
            {ads.map((ad, index) => (
              <section
                key={ad.id}
                aria-label={`Ad ${index + 1}`}
                data-export-ad
                className="space-y-5 rounded-2xl border border-border bg-surface-primary p-4 sm:p-6 print:break-inside-avoid print:break-after-page"
              >
                <div>
                  <p className="text-xs text-muted-foreground">
                    {ad.title ? `Ad ${index + 1} · ${ad.format}` : ad.format}
                  </p>
                  <h2 className="text-lg font-semibold">
                    {ad.title ?? `Ad ${index + 1}`}
                  </h2>
                </div>
                {ad.kind === "creative" ? (
                  <CreativePlacements
                    ad={ad}
                    brandName={preview.brandName}
                    brandLogo={preview.brandLogo}
                  />
                ) : (
                  <SearchAd ad={ad} />
                )}
              </section>
            ))}
          </div>
        )}
        {preview.catalog && (
          <section
            aria-label="Catalog"
            data-export-ad
            data-export-name="catalog"
            className="space-y-5 rounded-2xl border border-border bg-surface-primary p-4 sm:p-6"
          >
            <div>
              <p className="text-xs text-muted-foreground">
                Catalog · {preview.catalog.cards.length} of{" "}
                {preview.catalog.totalCards} homes
              </p>
              <h2 className="text-lg font-semibold">
                {preview.brandName} catalog ads
              </h2>
            </div>
            <p className="text-sm whitespace-pre-wrap">
              {preview.catalog.ad?.primaryText}
            </p>
            <div className="@container">
              <CatalogCollectionPreview
                brandName={preview.brandName}
                ad={preview.catalog.ad ?? undefined}
                cards={preview.catalog.cards}
              />
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Included homes</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
                {preview.catalog.cards.map((card) => (
                  <article
                    key={card.key}
                    className="space-y-2 print:break-inside-avoid"
                  >
                    {/* oxlint-disable-next-line nextjs/no-img-element */}
                    <img
                      src={card.image}
                      alt={card.headline}
                      className="aspect-square w-full rounded-lg bg-muted object-contain"
                    />
                    <p className="text-sm font-semibold">{card.headline}</p>
                    <p className="text-xs text-muted-foreground">
                      {card.description}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function CreativePlacements({
  ad,
  brandName,
  brandLogo,
}: {
  ad: Extract<AdPreviewAd, { kind: "creative" }>;
  brandName: string;
  brandLogo: string | null;
}) {
  const [card, setCard] = useState(0);
  return (
    // Printed, the three placements stay side by side and shrink to fit, so
    // each ad is one page instead of spilling onto the next.
    <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3 print:[zoom:0.78] print:grid-cols-3">
      {ad.placements.map((placement) => (
        <figure key={placement.id} className="break-inside-avoid space-y-2">
          <figcaption className="text-sm font-medium">
            {placement.label}
          </figcaption>
          <CompactAdMock
            preserveArtwork
            publisher={placement.publisher}
            verticalKind={placement.kind === "reel" ? "reel" : "story"}
            surface={placement.surface}
            frame={placement.frame}
            crop={placement.crop}
            brandName={brandName}
            brandLogo={brandLogo}
            body={ad.body}
            headline={ad.headline}
            description={ad.description}
            link={ad.linkUrl}
            callToAction={ad.callToAction}
            media={placement.media}
            card={Math.min(card, Math.max(0, placement.media.length - 1))}
            onCard={placement.media.length > 1 ? setCard : undefined}
          />
        </figure>
      ))}
    </div>
  );
}

/** Google shows a few of these at a time and rotates the rest. */
function SearchAd({ ad }: { ad: Extract<AdPreviewAd, { kind: "text" }> }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="max-w-xl space-y-1 rounded-xl border border-border p-4">
        <p className="text-xs">
          <span className="font-semibold">Sponsored</span>
          {ad.linkUrl ? ` · ${domainOf(ad.linkUrl)}` : ""}
        </p>
        <p className="text-lg leading-snug text-[#1a0dab]">
          {ad.headlines.slice(0, 3).join(" | ")}
        </p>
        <p className="text-sm text-muted-foreground">
          {ad.descriptions.slice(0, 2).join(" ")}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 font-medium">Headlines</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {ad.headlines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 font-medium">Descriptions</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {ad.descriptions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
