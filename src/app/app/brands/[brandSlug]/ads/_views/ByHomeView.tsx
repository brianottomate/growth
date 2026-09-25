"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AD_MOCK_SURFACES, AdMock } from "@/components/ad-mock";
import { cn } from "@/components/ui/lib/utils";
import {
  cardsForSurface,
  homeGroupKey,
  type HomeGroup,
  type WallAd,
} from "@/lib/ad-wall";
import { AD_FORMAT_LABEL } from "@/lib/performance-ads";

const panel = "bg-card overflow-hidden rounded-2xl border";
const sectionLabel =
  "text-muted-foreground text-[10.5px] font-semibold tracking-[0.09em] uppercase";

type Grouped = { homes: HomeGroup[]; other: WallAd[]; slices: WallAd[] };

/**
 * One house at a time, whole: each of its ads drawn in every placement side
 * by side, the words beside the pictures. Nothing is edited here; the wall
 * on the campaign page is where that happens. This page is for looking.
 */
export function ByHomeView({
  brandSlug,
  brandName,
  brandLogo,
  campaignId,
  campaignName,
  landingUrl,
  grouped,
  only,
}: {
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  campaignId: string;
  campaignName: string;
  landingUrl: string | null;
  grouped: Grouped;
  /** A home key from `?home=`, or "set" for the portfolio and catalog, or null for all. */
  only: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const back = pathname.replace(/\/by-home$/, "");

  const sections: {
    key: string;
    title: string;
    url: string | null;
    ads: WallAd[];
  }[] = [
    ...grouped.homes.map((group) => ({
      key: homeGroupKey(group),
      title: group.homeName,
      url: group.homeUrl,
      ads: group.ads,
    })),
    ...(grouped.other.length > 0
      ? [
          {
            key: "other",
            title: "About no home in particular",
            url: null,
            ads: grouped.other,
          },
        ]
      : []),
    ...(grouped.slices.length > 0
      ? [{ key: "set", title: "The whole set", url: null, ads: grouped.slices }]
      : []),
  ];
  const shown = only
    ? sections.filter((section) => section.key === only)
    : sections;
  const pick = (key: string | null) =>
    router.replace(
      key ? `${pathname}?home=${encodeURIComponent(key)}` : pathname,
      {
        scroll: false,
      },
    );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={back}
          className="inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4 shrink-0" />
          <span className="truncate">{campaignName}</span>
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">By home</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={!only} onClick={() => pick(null)}>
            All · {sections.reduce((n, section) => n + section.ads.length, 0)}
          </Chip>
          {sections.map((section) => (
            <Chip
              key={section.key}
              active={only === section.key}
              onClick={() => pick(section.key)}
            >
              {section.title} · {section.ads.length}
            </Chip>
          ))}
        </div>
      </header>

      {shown.length === 0 ? (
        <p
          className={cn(
            panel,
            "px-4 py-8 text-center text-xs text-muted-foreground",
          )}
        >
          {only
            ? "No home by that name in this campaign."
            : "No ads in this campaign yet."}
        </p>
      ) : null}

      {shown.map((section) => (
        <section key={section.key} id={section.key} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold">{section.title}</h2>
            {section.url ? (
              <a
                href={section.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[11px] text-muted-foreground hover:underline"
              >
                {section.url.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
          </div>
          <ul className="space-y-3">
            {section.ads.map((ad) => (
              <AdAcross
                key={ad.id}
                ad={ad}
                brandName={brandName}
                brandLogo={brandLogo}
                landingUrl={landingUrl}
                back={back}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors",
        active
          ? "border-foreground bg-foreground font-medium text-background"
          : "text-muted-foreground hover:border-white/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** One ad in every placement, the copy beside it. */
function AdAcross({
  ad,
  brandName,
  brandLogo,
  landingUrl,
  back,
}: {
  ad: WallAd;
  brandName: string;
  brandLogo: string | null;
  landingUrl: string | null;
  back: string;
}) {
  // One card index shared across the placements, so paging a carousel pages
  // it everywhere and the same card is compared in each crop.
  const [card, setCard] = useState(0);
  const shell = ad.cards.length === 0;
  const stories = ad.cards.filter((item) => item.story).length;

  return (
    <li className={cn(panel, "p-4")}>
      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-wrap items-start gap-4">
          {shell ? (
            <div className="grid h-40 w-full max-w-md grid-cols-1 place-items-center rounded-xl border border-dashed bg-muted/40 text-xs text-muted-foreground">
              No creative yet. Fill it on the campaign page.
            </div>
          ) : (
            AD_MOCK_SURFACES.map((option) => (
              <div key={option.id} className="space-y-1">
                <p className={sectionLabel}>
                  {option.label}
                  {option.id === "story"
                    ? stories > 0
                      ? " · its own 9:16"
                      : " · cropped from the baseline"
                    : ""}
                </p>
                <AdMock
                  surface={option.id}
                  brandName={brandName}
                  brandLogo={brandLogo}
                  body={ad.body}
                  headline={ad.headline}
                  link={ad.linkUrl ?? landingUrl}
                  callToAction={ad.callToAction}
                  media={cardsForSurface(ad.cards, option.id)}
                  card={card}
                  onCard={ad.cards.length > 1 ? setCard : undefined}
                  className={option.id === "story" ? "w-56" : "w-72"}
                />
              </div>
            ))
          )}
        </div>
        <div className="space-y-3 text-xs">
          <div>
            <p className={sectionLabel}>
              {AD_FORMAT_LABEL[ad.format]}
              {ad.format === "video"
                ? ""
                : ` · ${ad.cards.length} ${ad.cards.length === 1 ? "card" : "cards"}`}
              {ad.status === "approved" ? " · approved" : ""}
            </p>
            <p className="mt-0.5 text-[11px] break-all text-muted-foreground">
              {ad.name}
            </p>
          </div>
          <div>
            <p className={sectionLabel}>Headline</p>
            <p className="mt-0.5 font-medium">{ad.headline || "—"}</p>
          </div>
          <div>
            <p className={sectionLabel}>Primary text</p>
            <p className="mt-0.5 leading-5 whitespace-pre-line text-muted-foreground">
              {ad.body || "No primary text yet."}
            </p>
          </div>
          <div>
            <p className={sectionLabel}>Link · button</p>
            <p className="mt-0.5 break-all text-muted-foreground">
              {ad.linkUrl ?? landingUrl ?? "—"}
              {ad.callToAction ? ` · ${ad.callToAction}` : ""}
            </p>
          </div>
          {ad.cards.length > 1 ? (
            <ul className="flex flex-wrap gap-1.5">
              {ad.cards.map((item, index) => (
                <li key={`${ad.id}-${index}`}>
                  <button
                    type="button"
                    onClick={() => setCard(index)}
                    className={cn(
                      "block overflow-hidden rounded-md border",
                      card === index
                        ? "border-sky-400 ring-2 ring-sky-400/40"
                        : "",
                    )}
                    title={`Card ${index + 1}`}
                  >
                    {/* oxlint-disable-next-line nextjs/no-img-element */}
                    <img
                      src={item.thumbnail ?? item.url}
                      alt=""
                      className="size-10 object-cover"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Link
            href={back}
            className="text-[11px] text-sky-300 hover:underline"
          >
            Edit on the campaign page
          </Link>
        </div>
      </div>
    </li>
  );
}
