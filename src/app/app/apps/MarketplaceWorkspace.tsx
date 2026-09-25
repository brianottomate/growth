"use client";

import { useMemo, useState } from "react";
import {
  AppWindow,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Image as ImageIcon,
  MessageSquareText,
  Puzzle,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  TriangleAlert,
} from "lucide-react";

import {
  auditMarketplace,
  marketplaceQueue,
  marketplaceSurfaces,
  type MarketplaceFieldKind,
  type MarketplaceListing,
  type MarketplaceSurfaceId,
  type MarketplaceTruth,
} from "@/lib/marketplace-content";
import { cn } from "@/lib/utils";

const surfaceIcons = {
  app_store: Store,
  chrome_store: Puzzle,
  chatgpt_plugin: MessageSquareText,
  claude_connector: Bot,
} as const;

const kindIcons = {
  identity: AppWindow,
  copy: MessageSquareText,
  visual: ImageIcon,
  discovery: Search,
  trust: ShieldCheck,
  setup: Sparkles,
} satisfies Record<MarketplaceFieldKind, typeof AppWindow>;

const truthMeta: Record<
  MarketplaceTruth,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  verified_live: {
    label: "Verified live",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: CheckCircle2,
  },
  source_verified: {
    label: "Source verified",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    icon: CheckCircle2,
  },
  draft: {
    label: "Draft",
    className:
      "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    icon: CircleDashed,
  },
  verify: {
    label: "Verify",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    icon: TriangleAlert,
  },
  missing: {
    label: "Missing",
    className:
      "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    icon: TriangleAlert,
  },
  deferred: {
    label: "Deferred",
    className: "border-border bg-muted/50 text-muted-foreground",
    icon: CircleDashed,
  },
};

function TruthBadge({ truth }: { truth: MarketplaceTruth }) {
  const meta = truthMeta[truth];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        meta.className,
      )}
    >
      <Icon className="size-3" /> {meta.label}
    </span>
  );
}

export function MarketplaceWorkspace({
  listings,
}: {
  listings: MarketplaceListing[];
}) {
  const [surfaceId, setSurfaceId] = useState<MarketplaceSurfaceId | "all">(
    "all",
  );
  const [showDeferred, setShowDeferred] = useState(false);
  const audit = useMemo(() => auditMarketplace(listings), [listings]);
  const queue = useMemo(
    () => marketplaceQueue(listings).slice(0, 6),
    [listings],
  );
  const visibleListings =
    surfaceId === "all"
      ? listings
      : listings.filter((listing) => listing.surfaceId === surfaceId);
  const visibleSurfaces =
    surfaceId === "all"
      ? marketplaceSurfaces
      : marketplaceSurfaces.filter((surface) => surface.id === surfaceId);

  return (
    <main className="mx-auto max-w-[1480px] space-y-8 p-5 @xl:p-7">
      <header className="flex flex-col gap-5 border-b pb-6 @5xl:flex-row @5xl:items-end @5xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Wander brand map · persistent acquisition surfaces
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Apps & marketplaces
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Plan the copy, screenshot narrative, discovery metadata, setup, and
            trust content for mobile stores, browser extensions, and AI
            connectors—without confusing a repository fact with a verified
            public listing.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
          {[
            [audit.listings, "mapped listings"],
            [audit.verified, "verified fields"],
            [audit.open, "updates open"],
            [audit.missing, "fields missing"],
          ].map(([value, label]) => (
            <div
              key={label}
              className="min-w-28 rounded-xl border bg-card px-3 py-2.5"
            >
              <div className="text-xl font-semibold tabular-nums">{value}</div>
              <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
                {label}
              </div>
            </div>
          ))}
        </div>
      </header>

      <section className="space-y-3" aria-labelledby="marketplace-lens">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="marketplace-lens" className="text-sm font-semibold">
              Marketplace lens
            </h2>
            <p className="text-xs text-muted-foreground">
              Store fields are exact; connector presentation stays intentionally
              directional.
            </p>
          </div>
          <button
            type="button"
            aria-pressed={showDeferred}
            onClick={() => setShowDeferred((current) => !current)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
              showDeferred &&
                "bg-foreground text-background hover:text-background",
            )}
          >
            {showDeferred ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <CircleDashed className="size-3.5" />
            )}
            Show deferred
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-5">
          <button
            type="button"
            onClick={() => setSurfaceId("all")}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              surfaceId === "all"
                ? "border-foreground/30 bg-foreground text-background"
                : "bg-card hover:border-foreground/25",
            )}
          >
            <Sparkles className="size-4" />
            <span className="mt-4 block text-sm font-semibold">
              All surfaces
            </span>
            <span className="mt-0.5 block text-[11px] opacity-70">
              Cross-surface story
            </span>
          </button>
          {marketplaceSurfaces.map((surface) => {
            const Icon = surfaceIcons[surface.id];
            const count = listings.filter(
              (listing) => listing.surfaceId === surface.id,
            ).length;
            return (
              <button
                key={surface.id}
                type="button"
                onClick={() => setSurfaceId(surface.id)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  surfaceId === surface.id
                    ? "border-foreground/30 bg-foreground text-background"
                    : "bg-card hover:border-foreground/25",
                )}
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-4" />
                  <span className="text-[10px] opacity-60">{count} mapped</span>
                </div>
                <span className="mt-4 block text-sm font-semibold">
                  {surface.name.replace("Apple ", "")}
                </span>
                <span className="mt-0.5 block text-[11px] opacity-70">
                  {surface.confidence === "exact"
                    ? "Exact fields"
                    : "Directional playbook"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="marketplace-queue">
        <div>
          <h2 id="marketplace-queue" className="text-sm font-semibold">
            What to update next
          </h2>
          <p className="text-xs text-muted-foreground">
            Missing placements lead the queue; verification and working drafts
            follow.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {queue.map(({ listing, item, definition }, index) => {
            if (!definition) return null;
            const Icon = kindIcons[definition.kind];
            return (
              <article
                key={`${listing.id}-${item.fieldId}`}
                className="rounded-xl border bg-card p-3.5"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 grid-cols-1 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        0{index + 1}
                      </span>
                      <TruthBadge truth={item.truth} />
                    </div>
                    <h3 className="mt-2 text-sm font-semibold">
                      {listing.product} · {definition.label}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {item.next ?? definition.purpose}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="marketplace-inventory">
        <div>
          <h2 id="marketplace-inventory" className="text-sm font-semibold">
            Current placement inventory
          </h2>
          <p className="text-xs text-muted-foreground">
            Every visible promise or asset gets its own truth state and evidence
            trail.
          </p>
        </div>
        <div className="space-y-4">
          {visibleListings.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
              <p className="text-sm font-medium">
                No Wander listing is mapped for this surface.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The field playbook below remains ready for an evidence-backed
                inventory.
              </p>
            </div>
          ) : (
            visibleListings.map((listing) => {
              const surface = marketplaceSurfaces.find(
                (candidate) => candidate.id === listing.surfaceId,
              )!;
              const Icon = surfaceIcons[surface.id];
              const fields = listing.fields.filter(
                (item) => showDeferred || item.truth !== "deferred",
              );
              return (
                <article
                  key={listing.id}
                  className="overflow-hidden rounded-2xl border bg-card"
                >
                  <div className="flex items-start gap-3 border-b p-4">
                    <span className="grid size-10 shrink-0 grid-cols-1 place-items-center rounded-xl bg-foreground text-background">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{listing.product}</h3>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {surface.name}
                        </span>
                        <span className="rounded-full border px-2 py-0.5 text-[10px] capitalize">
                          {listing.availability}
                        </span>
                      </div>
                      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                        {listing.strategy}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Audience:
                        </span>{" "}
                        {listing.audience}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 @5xl:grid-cols-2">
                    {fields.map((item) => {
                      const definition = surface.fields.find(
                        (candidate) => candidate.id === item.fieldId,
                      );
                      if (!definition) return null;
                      const FieldIcon = kindIcons[definition.kind];
                      return (
                        <div
                          key={item.fieldId}
                          className="border-b p-4 @5xl:odd:border-r"
                        >
                          <div className="flex items-start gap-3">
                            <span className="grid size-7 shrink-0 grid-cols-1 place-items-center rounded-lg bg-muted text-muted-foreground">
                              <FieldIcon className="size-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-xs font-semibold">
                                  {definition.label}
                                </h4>
                                <TruthBadge truth={item.truth} />
                                <span className="ml-auto text-[9px] tracking-wide text-muted-foreground uppercase">
                                  {definition.kind}
                                </span>
                              </div>
                              {item.content && (
                                <p className="mt-2 text-sm leading-relaxed">
                                  {item.content}
                                </p>
                              )}
                              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                {item.next ?? definition.purpose}
                              </p>
                              {(item.evidence?.length ?? 0) > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {item.evidence?.map((evidence) =>
                                    evidence.url ? (
                                      <a
                                        key={`${evidence.label}-${evidence.checkedAt}`}
                                        href={evidence.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                                      >
                                        {evidence.label}
                                        <ExternalLink className="size-2.5" />
                                      </a>
                                    ) : (
                                      <span
                                        key={`${evidence.label}-${evidence.checkedAt}`}
                                        className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground"
                                      >
                                        {evidence.label} · {evidence.checkedAt}
                                      </span>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="marketplace-playbooks">
        <div>
          <h2 id="marketplace-playbooks" className="text-sm font-semibold">
            Surface field maps
          </h2>
          <p className="text-xs text-muted-foreground">
            Official rules structure the audit; live listings and authenticated
            dashboards remain the source of current truth.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 @5xl:grid-cols-2">
          {visibleSurfaces.map((surface) => {
            const Icon = surfaceIcons[surface.id];
            return (
              <article
                key={surface.id}
                className="rounded-2xl border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 grid-cols-1 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{surface.name}</h3>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px]",
                          surface.confidence === "exact"
                            ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                            : "border-amber-500/30 text-amber-700 dark:text-amber-300",
                        )}
                      >
                        {surface.confidence === "exact"
                          ? "Exact fields"
                          : "Directional fields"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {surface.context}
                    </p>
                    <a
                      href={surface.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                    >
                      Official guidance <ArrowUpRight className="size-3" />
                    </a>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 @xl:grid-cols-2">
                  {surface.fields.map((definition) => {
                    const FieldIcon = kindIcons[definition.kind];
                    return (
                      <div
                        key={definition.id}
                        className="rounded-xl border bg-muted/40 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <FieldIcon className="size-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold">
                            {definition.label}
                          </span>
                          <span className="ml-auto text-[9px] text-muted-foreground uppercase">
                            {definition.need}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                          {definition.purpose}
                        </p>
                        {definition.format && (
                          <p className="mt-1 text-[10px] font-medium">
                            {definition.format}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
