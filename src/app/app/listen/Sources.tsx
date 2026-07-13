"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Minus, Pencil, Plus } from "lucide-react";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import { subredditNames } from "@/lib/subreddit";
import type { AcquisitionShape } from "@/server/db/schema";
import { type RouterOutputs, useTRPC } from "@/trpc/react";

import { SourceDialog } from "./SourceDialog";
import { SubredditProfiles } from "./SubredditProfiles";

type Overview = RouterOutputs["listening"]["overview"];
type Source = Overview["sources"][number];

// Friendly framing for the three acquisition shapes — operator language, not
// the enum. Order = how they read top-to-bottom.
const GROUPS: { key: AcquisitionShape; title: string; blurb: string }[] = [
  {
    key: "keyword_search",
    title: "Market listening",
    blurb: "Public conversations we search for signal — Reddit, X, and more.",
  },
  {
    key: "account_watch",
    title: "Account watch",
    blurb:
      "Tastemaker / creator accounts we monitor to engage on their posts (Instagram).",
  },
  {
    key: "owned_inbound",
    title: "Owned inbound",
    blurb: "DMs and comments on our own accounts.",
  },
  {
    key: "provider_alert",
    title: "Provider alerts",
    blurb: "Third-party tools that push matches to us (F5Bot today).",
  },
];

/**
 * Where the actual listening / triage for a source happens today. External
 * rooms live on this page; owned-inbound triage lives on /app/inbox.
 */
function listeningSurfaceHref(s: Source, brandId: string): string {
  const brand = encodeURIComponent(brandId);
  if (s.acquisition === "account_watch")
    return `/app/listen?tab=instagram&brand=${brand}`;
  if (s.acquisition === "owned_inbound") {
    return s.adapter === "zernio-dms"
      ? "/app/inbox?tab=dms"
      : "/app/inbox?tab=comments";
  }
  if (s.adapter === "x-search" || s.platform === "x")
    return `/app/listen?tab=x&brand=${brand}`;
  // Reddit scan + provider alerts (F5Bot) both land in the Reddit room.
  return `/app/listen?tab=reddit&brand=${brand}`;
}

export function Sources({
  brand,
  sources,
}: {
  brand: { id: string; name: string };
  sources: Source[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Source | undefined>(undefined);

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const openEdit = (s: Source) => {
    setEditing(s);
    setDialogOpen(true);
  };

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            What we monitor
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Every place we listen, and what we listen for.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          Add source
        </Button>
      </div>

      {GROUPS.map((g) => {
        const groupSources = sources.filter((s) => s.acquisition === g.key);
        return (
          <div key={g.key} className="space-y-2.5">
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                {g.title}
              </h3>
              <p className="text-muted-foreground text-xs">{g.blurb}</p>
            </div>
            {groupSources.length === 0 ? (
              <p className="text-muted-foreground/70 rounded-lg border border-dashed px-4 py-3 text-xs">
                Nothing here yet.
              </p>
            ) : (
              <div className="grid gap-2.5">
                {groupSources.map((s) => (
                  <SourceCard
                    key={s.id}
                    source={s}
                    brandId={brand.id}
                    onEdit={() => openEdit(s)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <SourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        brandId={brand.id}
        initial={editing}
      />
    </section>
  );
}

function SourceCard({
  source,
  brandId,
  onEdit,
}: {
  source: Source;
  brandId: string;
  onEdit: () => void;
}) {
  // Latest "confirmed live in the provider" date across this source's alert terms.
  const verifiedDates = (source.config?.alertTerms ?? [])
    .map((t) => t.verifiedAt)
    .filter((d): d is string => Boolean(d))
    .sort();
  const verifiedAt = verifiedDates.at(-1) ?? null;

  return (
    <article className="bg-card rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <ChannelLogo platform={source.platform} className="mt-0.5 size-5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-sm font-medium">
              {source.label ?? platformLabel(source.platform)}
            </span>
            {verifiedAt && <VerifiedBadge date={verifiedAt} />}
            {!source.isActive && <StatusBadge tone="muted" label="Paused" />}
          </div>

          <Watching source={source} />

          {source.signalNotes && (
            <p className="text-muted-foreground mt-2 line-clamp-2 text-xs italic">
              {source.signalNotes}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ButtonLink
            href={listeningSurfaceHref(source, brandId)}
            variant="ghost"
            size="sm"
          >
            View feed
            <ArrowRight className="size-3.5" />
          </ButtonLink>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>
      </div>

      {/* Per-subreddit AI evaluation + voice overrides — Reddit market sources only. */}
      {source.platform === "reddit" &&
        source.acquisition === "keyword_search" && (
          <SubredditProfiles source={source} />
        )}

      {/* Desired-state workflow for provider-configured terms (F5Bot): decide
          the term set here, apply it in the provider's UI, mark it done. */}
      {source.acquisition === "provider_alert" && (
        <SetupTasks source={source} />
      )}
    </article>
  );
}

/**
 * Pending provider changes — terms we've decided to add or remove but haven't
 * applied in the provider's own UI yet. "Mark applied" flips a to_add term to
 * live (stamping verifiedAt) or drops a to_remove term from the config.
 */
// Where a provider_alert source's terms are actually configured — the setup-task
// panel deep-links here. Keyed by adapter slug; unknown adapters fall back to a
// plain label with no link.
const PROVIDER_DASHBOARDS: Record<string, { label: string; url: string }> = {
  f5bot: { label: "F5Bot", url: "https://f5bot.com/dash" },
  "impact-social-listening": {
    label: "Impact Social Listening",
    url: "https://app.impact.com/secure/advertiser/discover/protect/fr/social-listening.ihtml",
  },
};

function SetupTasks({ source }: { source: Source }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const terms = source.config?.alertTerms ?? [];
  const pending = terms.filter(
    (t) => t.status === "to_add" || t.status === "to_remove",
  );

  const update = useMutation(
    trpc.listening.updateSource.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.listening.overview.queryKey(),
        });
      },
    }),
  );

  if (pending.length === 0) return null;

  const markApplied = (term: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const next = terms
      .filter((t) => !(t.term === term && t.status === "to_remove"))
      .map((t) =>
        t.term === term && t.status === "to_add"
          ? { ...t, status: "live" as const, verifiedAt: today }
          : t,
      );
    update.mutate({
      id: source.id,
      patch: { config: { ...source.config, alertTerms: next } },
    });
  };

  return (
    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-xs font-semibold text-amber-400">
        Setup tasks — apply in{" "}
        {(() => {
          const dash = PROVIDER_DASHBOARDS[source.adapter];
          return dash ? (
            <a
              href={dash.url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              {dash.label} ↗
            </a>
          ) : (
            <span>{source.adapter}</span>
          );
        })()}
        , then mark done
      </p>
      <ul className="mt-2 space-y-1.5">
        {pending.map((t) => (
          <li key={t.term} className="flex items-center gap-2 text-xs">
            {t.status === "to_add" ? (
              <Plus className="size-3.5 shrink-0 text-emerald-400" />
            ) : (
              <Minus className="size-3.5 shrink-0 text-rose-400" />
            )}
            <span className="text-foreground min-w-0">
              {t.status === "to_add" ? "Add" : "Remove"}{" "}
              <span className="font-mono">&ldquo;{t.term}&rdquo;</span>
              {t.status === "to_add" && t.flags?.length ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({t.flags.join(", ")})
                </span>
              ) : null}
              {t.note && (
                <span className="text-muted-foreground italic">
                  {" "}
                  — {t.note}
                </span>
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-6 shrink-0 px-2 text-[11px]"
              disabled={update.isPending}
              onClick={() => markApplied(t.term)}
            >
              <Check className="size-3" />
              Mark applied
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The "what we listen for" line — chips derived from the source's config/shape. */
function Watching({ source }: { source: Source }) {
  const cfg = source.config ?? {};
  const chips: string[] = [];
  if (cfg.subreddits?.length)
    chips.push(...subredditNames(cfg.subreddits).map((s) => `r/${s}`));
  if (cfg.keywords?.length) chips.push(...cfg.keywords);
  // Pending to_add/to_remove terms live in the SetupTasks block, not the chips.
  if (cfg.alertTerms?.length)
    chips.push(
      ...cfg.alertTerms
        .filter((t) => (t.status ?? "live") === "live")
        .map((t) => `“${t.term}”`),
    );
  if (cfg.watchlistGroups?.length)
    chips.push(
      ...cfg.watchlistGroups.map((g) => `${g.name} (${g.terms.length})`),
    );
  if (cfg.accounts?.length)
    chips.push(...cfg.accounts.map((a) => `@${a.handle ?? a.label ?? a.url}`));

  if (chips.length === 0) {
    const fallback =
      source.acquisition === "owned_inbound"
        ? "Inbound DMs / comments from the connected account"
        : source.acquisition === "provider_alert"
          ? "Keyword alerts pushed from the provider"
          : "No terms configured yet";
    return <p className="text-muted-foreground mt-1.5 text-xs">{fallback}</p>;
  }

  const shown = chips.slice(0, 8);
  const extra = chips.length - shown.length;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {shown.map((c) => (
        <span
          key={c}
          className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]"
        >
          {c}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-muted-foreground/70 px-1 text-[11px]">
          +{extra} more
        </span>
      )}
    </div>
  );
}

function VerifiedBadge({ date }: { date: string }) {
  const label = new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <span
      title="Confirmed live in the provider (F5Bot)"
      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
    >
      <Check className="size-3" />
      Verified · {label}
    </span>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "emerald" | "amber" | "muted";
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
        tone === "emerald" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
        tone === "amber" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-400",
        tone === "muted" && "text-muted-foreground bg-muted border-transparent",
      )}
    >
      {label}
    </span>
  );
}
