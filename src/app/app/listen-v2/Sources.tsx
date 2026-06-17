"use client";

import { useState } from "react";
import { ArrowRight, Pencil, Plus } from "lucide-react";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import type { AcquisitionShape } from "@/server/db/schema";
import { type RouterOutputs } from "@/trpc/react";

import { SourceDialog } from "./SourceDialog";

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
 * Where the actual listening / triage for a source happens today. These point
 * at the existing /app/listen surfaces for now; re-point them at the v2 Inbox
 * tab once it exists.
 */
function listeningSurfaceHref(s: Source): string {
  if (s.acquisition === "owned_inbound") {
    return s.adapter === "zernio-dms"
      ? "/app/listen?tab=dms"
      : "/app/listen?tab=comments";
  }
  if (s.adapter === "x-search" || s.platform === "x") return "/app/listen?tab=x";
  // Reddit scan + provider alerts (F5Bot) both surface under "mentions".
  return "/app/listen?tab=mentions";
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
          <h2 className="text-lg font-semibold tracking-tight">What we monitor</h2>
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
              <h3 className="text-foreground text-sm font-semibold">{g.title}</h3>
              <p className="text-muted-foreground text-xs">{g.blurb}</p>
            </div>
            {groupSources.length === 0 ? (
              <p className="text-muted-foreground/70 rounded-lg border border-dashed px-4 py-3 text-xs">
                Nothing here yet.
              </p>
            ) : (
              <div className="grid gap-2.5">
                {groupSources.map((s) => (
                  <SourceCard key={s.id} source={s} onEdit={() => openEdit(s)} />
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

function SourceCard({ source, onEdit }: { source: Source; onEdit: () => void }) {
  return (
    <article className="bg-card rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <ChannelLogo platform={source.platform} className="mt-0.5 size-5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-sm font-medium">
              {source.label ?? platformLabel(source.platform)}
            </span>
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
            href={listeningSurfaceHref(source)}
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
    </article>
  );
}

/** The "what we listen for" line — chips derived from the source's config/shape. */
function Watching({ source }: { source: Source }) {
  const cfg = source.config ?? {};
  const chips: string[] = [];
  if (cfg.subreddits?.length) chips.push(...cfg.subreddits.map((s) => `r/${s}`));
  if (cfg.keywords?.length) chips.push(...cfg.keywords);
  if (cfg.watchlistGroups?.length)
    chips.push(
      ...cfg.watchlistGroups.map((g) => `${g.name} (${g.terms.length})`),
    );

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
        tone === "emerald" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
        tone === "amber" && "border-amber-500/40 bg-amber-500/10 text-amber-400",
        tone === "muted" && "text-muted-foreground bg-muted border-transparent",
      )}
    >
      {label}
    </span>
  );
}
