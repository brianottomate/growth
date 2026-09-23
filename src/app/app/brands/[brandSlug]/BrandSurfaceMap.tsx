import Link from "next/link";
import {
  AppWindow,
  ArrowRight,
  BookOpen,
  FileStack,
  GalleryVerticalEnd,
  Globe2,
  Radio,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { BrandSurfaceSummary } from "@/server/services/brand-map.service";

type Surface = {
  title: string;
  description: string;
  href: string;
  icon: typeof Radio;
  facts: string[];
  state: "mapped" | "partial" | "empty";
};

const stateLabel = {
  mapped: "Mapped",
  partial: "Needs structure",
  empty: "Not mapped",
} as const;

const stateClass = {
  mapped: "bg-emerald-500",
  partial: "bg-amber-500",
  empty: "bg-muted-foreground/35",
} as const;

function fact(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function BrandSurfaceMap({
  brandId,
  brandSlug,
  summary,
}: {
  brandId: string;
  brandSlug: string;
  summary: BrandSurfaceSummary;
}) {
  const surfaces: Surface[] = [
    {
      title: "Strategy",
      description: "The intended mix and cadence AI should plan against.",
      href: `/app/brands/${brandSlug}/strategy`,
      icon: Target,
      facts: [
        summary.hasStrategyTargets ? "Targets set" : "No targets yet",
        fact(summary.peers, "tracked peer"),
      ],
      state: summary.hasStrategyTargets ? "mapped" : "partial",
    },
    {
      title: "Distribution",
      description: "Owned social, ad, newsletter, and blog channels.",
      href: `/app/channels?brand=${encodeURIComponent(brandId)}`,
      icon: Radio,
      facts: [fact(summary.channels, "channel")],
      state: summary.channels > 0 ? "mapped" : "empty",
    },
    {
      title: "Personas",
      description:
        "Who the brand talks to — the stable layer campaigns narrow.",
      href: `/app/brands/${brandSlug}/strategy`,
      icon: Target,
      facts: [fact(summary.personas, "persona")],
      state: summary.personas > 0 ? "mapped" : "partial",
    },
    {
      title: "Owned surfaces",
      description: "The persistent website map and dated editorial stream.",
      href: `/app/website?brand=${encodeURIComponent(brandSlug)}`,
      icon: Globe2,
      facts: [
        fact(summary.webPages, "web page"),
        fact(summary.blogPosts, "article"),
      ],
      state:
        summary.webPages > 0 && summary.blogPosts > 0
          ? "mapped"
          : summary.webPages > 0 || summary.blogPosts > 0
            ? "partial"
            : "empty",
    },
    {
      title: "Apps & marketplaces",
      description:
        "Persistent store pages, connector discovery, and their marketing placements.",
      href: `/app/apps?brand=${encodeURIComponent(brandId)}`,
      icon: AppWindow,
      facts: ["6 surface types", "Freshness workflow"],
      state: "mapped",
    },
    {
      title: "Content & schedule",
      description:
        "Canonical ideas, recurring series, and the upcoming worklist.",
      href: `/app/content?brandId=${encodeURIComponent(brandId)}&view=schedule`,
      icon: FileStack,
      facts: [
        fact(summary.contentIdeas, "idea"),
        fact(summary.series, "series", "series"),
      ],
      state:
        summary.contentIdeas > 0
          ? summary.series > 0
            ? "mapped"
            : "partial"
          : "empty",
    },
    {
      title: "Creative library",
      description: "Reusable media with human organization and AI analysis.",
      href: `/app/media?brand=${encodeURIComponent(brandId)}`,
      icon: GalleryVerticalEnd,
      facts: [fact(summary.mediaAssets, "asset")],
      state: summary.mediaAssets > 0 ? "mapped" : "empty",
    },
    {
      title: "Compositions",
      description:
        "The Studio, opened on this brand: its photos, mark and font on a blueprint.",
      href: `/app/compositions?brandId=${encodeURIComponent(brandId)}`,
      icon: GalleryVerticalEnd,
      facts: [summary.mediaAssets > 0 ? "Photos ready" : "Import photos first"],
      state: summary.mediaAssets > 0 ? "mapped" : "partial",
    },
  ];

  return (
    <section aria-labelledby="brand-map-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="brand-map-heading" className="text-base font-semibold">
            Brand map
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            The confirmed surfaces the assistant can reason across. Open a
            surface to inspect the underlying reality or refine the structure
            layered over it.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/app/review"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors hover:bg-accent",
              summary.pendingReviews > 0 &&
                "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            )}
          >
            <BookOpen className="size-3.5" />
            {summary.pendingReviews > 0
              ? `${summary.pendingReviews} to review`
              : "Review structure"}
          </Link>
          <Link
            href={`/app/next?brandId=${encodeURIComponent(brandId)}&intent=plan`}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground"
          >
            Plan ahead <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {surfaces.map((surface) => {
          const Icon = surface.icon;
          return (
            <Link
              key={surface.title}
              href={surface.href}
              className="group rounded-xl border bg-card p-3.5 transition-colors hover:border-foreground/25"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {surface.title}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          stateClass[surface.state],
                        )}
                      />
                      {stateLabel[surface.state]}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {surface.description}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    {surface.facts.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </span>
                </span>
                <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
