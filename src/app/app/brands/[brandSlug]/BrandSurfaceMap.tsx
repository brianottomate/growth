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
  summary,
}: {
  brandId: string;
  summary: BrandSurfaceSummary;
}) {
  const surfaces: Surface[] = [
    {
      title: "Strategy",
      description: "The intended mix and cadence AI should plan against.",
      href: "#strategy",
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
      href: "/app/channels",
      icon: Radio,
      facts: [fact(summary.channels, "channel")],
      state: summary.channels > 0 ? "mapped" : "empty",
    },
    {
      title: "Audiences",
      description: "Confirmed people to reach, evidence, and activation gaps.",
      href: "/app/audiences",
      icon: Target,
      facts: [fact(summary.audienceTargets, "target")],
      state: summary.audienceTargets > 0 ? "mapped" : "partial",
    },
    {
      title: "Owned surfaces",
      description: "The persistent website map and dated editorial stream.",
      href: "/app/website",
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
      href: "/app/apps",
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
      href: "/app/media",
      icon: GalleryVerticalEnd,
      facts: [fact(summary.mediaAssets, "asset")],
      state: summary.mediaAssets > 0 ? "mapped" : "empty",
    },
  ];

  return (
    <section aria-labelledby="brand-map-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="brand-map-heading" className="text-base font-semibold">
            Brand map
          </h2>
          <p className="text-muted-foreground mt-0.5 max-w-2xl text-sm">
            The confirmed surfaces the assistant can reason across. Open a
            surface to inspect the underlying reality or refine the structure
            layered over it.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/app/review"
            className={cn(
              "hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
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
            className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium"
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
              className="bg-card hover:border-foreground/25 group rounded-xl border p-3.5 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {surface.title}
                    </span>
                    <span className="text-muted-foreground ml-auto flex items-center gap-1 text-[10px]">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          stateClass[surface.state],
                        )}
                      />
                      {stateLabel[surface.state]}
                    </span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">
                    {surface.description}
                  </span>
                  <span className="text-muted-foreground mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
                    {surface.facts.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </span>
                </span>
                <ArrowRight className="text-muted-foreground mt-1 size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
