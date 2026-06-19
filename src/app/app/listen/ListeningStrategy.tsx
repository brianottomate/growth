"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { reconcileSubreddits, subredditNames } from "@/lib/subreddit";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

type Overview = RouterOutputs["listening"]["overview"];
type Source = Overview["sources"][number];

const ACQUISITION_LABEL: Record<string, string> = {
  keyword_search: "Market — keyword search",
  owned_inbound: "Owned — inbound",
  provider_alert: "Provider — pushed alerts",
};

const linesToArr = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const arrToLines = (a?: string[]) => (a ?? []).join("\n");

export function ListeningStrategy() {
  const trpc = useTRPC();
  const { data, isLoading, isError, error } = useQuery(
    trpc.listening.overview.queryOptions(),
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Loading listening strategy…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error.message}
      </div>
    );
  }
  if (!data?.brand) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No listening brand configured. Run{" "}
        <code className="font-mono">scripts/seed-listening-sources.ts</code>.
      </div>
    );
  }

  // Group sources by acquisition shape.
  const groups = new Map<string, Source[]>();
  for (const s of data.sources) {
    const arr = groups.get(s.acquisition) ?? [];
    arr.push(s);
    groups.set(s.acquisition, arr);
  }

  return (
    <div className="space-y-8">
      <StoryEditor
        brandId={data.brand.id}
        story={data.story}
        brandVoice={data.brandVoice}
      />

      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Listening sources
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            One row per place we listen. Behaviour = platform · acquisition ·
            trigger · adapter. <span className="font-medium">Shadow</span> rows
            are read for comparison only and don&apos;t drive live scans yet.
          </p>
        </div>
        {[...groups.entries()].map(([acq, sources]) => (
          <div key={acq} className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {ACQUISITION_LABEL[acq] ?? acq}
            </h4>
            {sources.map((s) => (
              <SourceCard key={s.id} source={s} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StoryEditor({
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
      onSuccess: () =>
        void queryClient.invalidateQueries(
          trpc.listening.overview.queryOptions(),
        ),
    }),
  );

  const [signalGuidance, setSignal] = useState(story?.signalGuidance ?? "");
  const [replyGuidance, setReply] = useState(story?.replyGuidance ?? "");
  const [productBoilerplate, setProduct] = useState(
    story?.productBoilerplate ?? "",
  );

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Brand listening story
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The shared judgment injected into every source&apos;s scoring +
            reply prompts. Evolve it here — no deploy.
          </p>
        </div>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              brandId,
              story: { signalGuidance, replyGuidance, productBoilerplate },
            })
          }
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save story"}
        </button>
      </div>

      {brandVoice && (
        <p className="mt-3 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Voice</span> (from
          brand fingerprint, shared with publishing — not edited here):{" "}
          {brandVoice.length > 200 ? `${brandVoice.slice(0, 200)}…` : brandVoice}
        </p>
      )}

      <Field label="What counts as signal">
        <Area value={signalGuidance} onChange={setSignal} rows={5} />
      </Field>
      <Field label="How we reply (etiquette + the Wander Test)">
        <Area value={replyGuidance} onChange={setReply} rows={4} />
      </Field>
      <Field label="Product boilerplate (optional)">
        <Area value={productBoilerplate} onChange={setProduct} rows={3} />
      </Field>

      {story?.updatedAt && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Last edited {new Date(story.updatedAt).toLocaleString()}
          {story.updatedBy ? ` by ${story.updatedBy}` : ""}
        </p>
      )}
    </div>
  );
}

function SourceCard({ source }: { source: Source }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const save = useMutation(
    trpc.listening.updateSource.mutationOptions({
      onSuccess: () =>
        void queryClient.invalidateQueries(
          trpc.listening.overview.queryOptions(),
        ),
    }),
  );

  const [label, setLabel] = useState(source.label ?? "");
  const [isActive, setActive] = useState(source.isActive);
  const [trigger, setTrigger] = useState(source.trigger);
  const [scheduleCron, setCron] = useState(source.scheduleCron ?? "");
  const [signalNotes, setNotes] = useState(source.signalNotes ?? "");
  const [subreddits, setSubreddits] = useState(
    arrToLines(subredditNames(source.config?.subreddits)),
  );
  const [keywords, setKeywords] = useState(arrToLines(source.config?.keywords));
  const [groups, setGroups] = useState(
    (source.config?.watchlistGroups ?? []).map((g) => ({
      ...g,
      text: arrToLines(g.terms),
    })),
  );
  const [voiceText, setVoiceText] = useState(
    source.voiceOverride?.fingerprintText ?? "",
  );
  const [overridesBrand, setOverrides] = useState(
    source.voiceOverride?.overridesBrand ?? false,
  );

  // Keep local state in sync if the row is refetched after save.
  useEffect(() => {
    setActive(source.isActive);
  }, [source.isActive]);

  const handleSave = () => {
    const config: Record<string, unknown> = {};
    if (source.config?.subreddits)
      config.subreddits = reconcileSubreddits(
        source.config.subreddits,
        linesToArr(subreddits),
      );
    if (source.config?.keywords) config.keywords = linesToArr(keywords);
    if (source.config?.watchlistGroups)
      config.watchlistGroups = groups.map((g) => ({
        id: g.id,
        name: g.name,
        terms: linesToArr(g.text),
      }));
    if (source.config?.windowDays != null)
      config.windowDays = source.config.windowDays;
    if (source.config?.ignoreList) config.ignoreList = source.config.ignoreList;
    if (source.config?.maxResults != null)
      config.maxResults = source.config.maxResults;

    save.mutate({
      id: source.id,
      patch: {
        label: label.trim() || null,
        isActive,
        trigger,
        scheduleCron: trigger === "scheduled" ? scheduleCron.trim() || null : null,
        signalNotes: signalNotes.trim() || null,
        config,
        voiceOverride: voiceText.trim()
          ? { fingerprintText: voiceText.trim(), overridesBrand }
          : null,
      },
    });
  };

  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{source.platform}</Badge>
        <Badge muted>{source.acquisition}</Badge>
        <Badge muted>{source.adapter}</Badge>
        <Toggle on={isActive} onClick={() => setActive((v) => !v)} label="Active" />
        <span className="ml-auto" />
        <button
          type="button"
          disabled={save.isPending}
          onClick={handleSave}
          className="rounded-md border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label"
        className="mt-3 w-full rounded-md border bg-background px-2.5 py-1.5 text-sm font-medium text-foreground focus:ring-1 focus:ring-ring focus:outline-none"
      />

      {/* Trigger + cadence */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Trigger:</span>
        {(["on_demand", "scheduled", "webhook"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTrigger(t)}
            className={`rounded-full border px-2.5 py-0.5 transition-colors ${
              trigger === t
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            {t}
          </button>
        ))}
        {trigger === "scheduled" && (
          <input
            value={scheduleCron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="cron e.g. 0 * * * *"
            className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs text-foreground focus:ring-1 focus:ring-ring focus:outline-none"
          />
        )}
      </div>

      {/* Source config — only what this source actually uses */}
      {source.config?.subreddits && (
        <Field label="Subreddits (one per line)">
          <Area value={subreddits} onChange={setSubreddits} rows={4} mono />
        </Field>
      )}
      {source.config?.keywords && (
        <Field label="Keywords (one per line)">
          <Area value={keywords} onChange={setKeywords} rows={4} mono />
        </Field>
      )}
      {source.config?.watchlistGroups && groups.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-foreground">Watchlist groups</p>
          {groups.map((g, i) => (
            <div key={g.id}>
              <p className="text-[11px] text-muted-foreground">{g.name}</p>
              <Area
                value={g.text}
                onChange={(v) =>
                  setGroups((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, text: v } : x)),
                  )
                }
                rows={3}
                mono
              />
            </div>
          ))}
        </div>
      )}
      {source.acquisition === "owned_inbound" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Inbound surface (Zernio) — no keyword config; reads from the connected
          account.
        </p>
      )}

      <Field label="Signal notes (layered over the brand story for this source)">
        <Area value={signalNotes} onChange={setNotes} rows={2} />
      </Field>

      <Field label="Voice override (optional — leave blank to use brand voice)">
        <Area value={voiceText} onChange={setVoiceText} rows={2} />
      </Field>
      {voiceText.trim() && (
        <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={overridesBrand}
            onChange={(e) => setOverrides(e.target.checked)}
          />
          Replace brand voice entirely (instead of layering on top)
        </label>
      )}
    </article>
  );
}

// ---- small UI atoms ----

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Area({
  value,
  onChange,
  rows,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: number;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={`w-full rounded-md border bg-background px-2.5 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-ring focus:outline-none ${
        mono ? "font-mono text-xs" : ""
      }`}
    />
  );
}

function Badge({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={`rounded px-2 py-0.5 font-mono text-xs ${
        muted ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
      }`}
    >
      {children}
    </span>
  );
}

function Toggle({
  on,
  onClick,
  label,
  tone = "emerald",
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  tone?: "emerald" | "amber";
}) {
  const toneCls = on
    ? tone === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
      : "border-amber-500/40 bg-amber-500/15 text-amber-400"
    : "bg-background text-muted-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${toneCls}`}
    >
      {label}
    </button>
  );
}
