"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus } from "lucide-react";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/components/ui/lib/utils";
import type { AcquisitionShape } from "@/server/db/schema";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

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

export function MonitorStrategy() {
  const trpc = useTRPC();
  const { data, isLoading, isError, error } = useQuery(
    trpc.listening.overview.queryOptions(),
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Source | undefined>(undefined);

  if (isLoading) {
    return <Skeleton label="listening strategy" />;
  }
  if (isError) {
    return (
      <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
        {error.message}
      </div>
    );
  }
  if (!data?.brand) {
    return (
      <div className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
        No listening brand configured. Run{" "}
        <code className="font-mono">scripts/seed-listening-sources.ts</code>.
      </div>
    );
  }

  const { brand } = data;
  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const openEdit = (s: Source) => {
    setEditing(s);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-8">
      <Playbook brandId={brand.id} story={data.story} brandVoice={data.brandVoice} />

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">What we monitor</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Every place we listen, and what we listen for. New sources start in{" "}
              <span className="font-medium">shadow</span> until you flip them live.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            Add source
          </Button>
        </div>

        {GROUPS.map((g) => {
          const sources = data.sources.filter((s) => s.acquisition === g.key);
          return (
            <div key={g.key} className="space-y-2.5">
              <div>
                <h3 className="text-foreground text-sm font-semibold">{g.title}</h3>
                <p className="text-muted-foreground text-xs">{g.blurb}</p>
              </div>
              {sources.length === 0 ? (
                <p className="text-muted-foreground/70 rounded-lg border border-dashed px-4 py-3 text-xs">
                  Nothing here yet.
                </p>
              ) : (
                <div className="grid gap-2.5">
                  {sources.map((s) => (
                    <SourceCard key={s.id} source={s} onEdit={() => openEdit(s)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <SourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        brandId={brand.id}
        initial={editing}
      />
    </div>
  );
}

// ---- Source card (operator-readable) ----------------------------------------

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
            <StatusBadge
              tone={source.shadow ? "amber" : "emerald"}
              label={source.shadow ? "Shadow" : "Live"}
            />
            {!source.isActive && <StatusBadge tone="muted" label="Paused" />}
          </div>

          <Watching source={source} />

          {source.signalNotes && (
            <p className="text-muted-foreground mt-2 line-clamp-2 text-xs italic">
              {source.signalNotes}
            </p>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={onEdit} className="shrink-0">
          <Pencil className="size-3.5" />
          Edit
        </Button>
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

// ---- Playbook (the brand listening story) -----------------------------------

function Playbook({
  brandId,
  story,
  brandVoice,
}: {
  brandId: string;
  story: Overview["story"];
  brandVoice: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const save = useMutation(
    trpc.listening.updateStory.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.listening.overview.queryOptions(),
        );
        toast.success("Playbook saved");
      },
      onError: (e) => toast.error(e.message || "Failed to save"),
    }),
  );

  const [signalGuidance, setSignal] = useState(story?.signalGuidance ?? "");
  const [replyGuidance, setReply] = useState(story?.replyGuidance ?? "");
  const [productBoilerplate, setProduct] = useState(
    story?.productBoilerplate ?? "",
  );

  return (
    <section className="bg-card rounded-xl border p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Playbook</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            The shared judgment injected into every scan and reply draft — what
            counts as signal, and how Wander replies. Edit it live; it takes
            effect on the next scan.
          </p>
        </div>
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              brandId,
              story: { signalGuidance, replyGuidance, productBoilerplate },
            })
          }
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Save playbook
        </Button>
      </div>

      {brandVoice && (
        <p className="bg-muted/40 text-muted-foreground mt-4 rounded-md border border-dashed px-3 py-2 text-xs">
          <span className="text-foreground font-semibold">Voice</span> — shared
          with publishing, edited on the brand fingerprint, not here:{" "}
          {brandVoice.length > 240 ? `${brandVoice.slice(0, 240)}…` : brandVoice}
        </p>
      )}

      <div className="mt-4 space-y-4">
        <Field
          label="What counts as signal"
          hint="High vs low signal; what's worth engaging with."
        >
          <Textarea
            value={signalGuidance}
            onChange={(e) => setSignal(e.target.value)}
            rows={5}
          />
        </Field>
        <Field
          label="How we reply — the Wander Test"
          hint='Etiquette + "could this reply only come from Wander?"'
        >
          <Textarea
            value={replyGuidance}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
          />
        </Field>
        <Field
          label="Product framing"
          hint="WanderOS / Sites / Operated boilerplate (optional)."
        >
          <Textarea
            value={productBoilerplate}
            onChange={(e) => setProduct(e.target.value)}
            rows={3}
          />
        </Field>
      </div>

      {story?.updatedAt && (
        <p className="text-muted-foreground mt-3 text-[11px]">
          Last edited {new Date(story.updatedAt).toLocaleString()}
          {story.updatedBy ? ` by ${story.updatedBy}` : ""}
        </p>
      )}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint && <p className="text-muted-foreground -mt-1 text-xs">{hint}</p>}
      {children}
    </div>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div className="bg-card text-muted-foreground rounded-lg border p-4 text-sm">
      Loading {label}…
    </div>
  );
}
