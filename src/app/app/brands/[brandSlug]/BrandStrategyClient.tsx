"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import type {
  BrandStrategy,
  CadenceStatus,
  ChannelCadence,
} from "@/server/services/cadence.service";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import type { ChannelBackfillState } from "@/server/services/peer-scrape.service";
import { ChannelBackfill } from "./ChannelBackfill";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import { useTRPC } from "@/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Strategy redesign (from claude.ai/design "Strategy — redesign").
 * The core object is the GAUGE: observed (filled bar) + target (solid tick) +
 * peer (dotted tick) on one track, so the delta is spatial. Color only the
 * exceptions. Lead with a verdict, then attention-sorted channel gauges, then
 * the content mix (with a recruiting empty state while posts are unclassified).
 */

// ---- status palette --------------------------------------------------------
type Status = CadenceStatus | "dormant";
const STATUS: Record<
  Status,
  { label: string; color: string; muted?: boolean }
> = {
  on: { label: "On pace", color: "#10b981", muted: true },
  under: { label: "Behind", color: "#f59e0b" },
  over: { label: "Over", color: "#0ea5e9" },
  dormant: { label: "Dormant", color: "var(--color-neutral-450)", muted: true },
  untracked: {
    label: "No target",
    color: "var(--color-neutral-450)",
    muted: true,
  },
};

const ARCH_LABEL: Record<string, string> = {
  article: "Article",
  image: "Image",
  carousel: "Carousel",
  video_short: "Short video",
  video_long: "Long video",
  text: "Text",
  story: "Story",
  other: "Other",
};

const CH_META: Record<
  string,
  { code: string; short: string; hue: string; wide?: boolean }
> = {
  newsletter: { code: "NL", short: "Newsletter", hue: "#f97316", wide: true },
  blog: { code: "BLG", short: "Blog", hue: "#a855f7", wide: true },
  instagram: { code: "IG", short: "Instagram", hue: "#ec4899" },
  x: { code: "X", short: "X", hue: "var(--color-primary)" },
  tiktok: { code: "TK", short: "TikTok", hue: "var(--color-primary)" },
  facebook: { code: "FB", short: "Facebook", hue: "#3b82f6" },
  linkedin: { code: "LI", short: "LinkedIn", hue: "#3b82f6" },
  youtube: { code: "YT", short: "YouTube", hue: "#ef4444" },
};
const chMeta = (platform: string) =>
  CH_META[platform] ?? {
    code: platform.slice(0, 3).toUpperCase(),
    short: platformLabel(platform),
    hue: "var(--color-secondary)",
  };

const pillarMeta = (slug: string) =>
  slug === "__unsorted"
    ? { name: "Unsorted", color: "var(--color-neutral-450)" }
    : (PILLAR_BY_SLUG[slug] ?? {
        name: slug,
        color: "var(--color-neutral-450)",
      });

const archLabel = (a: string) => ARCH_LABEL[a] ?? a;
const fmt1 = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

/** human rhythm phrasing — 0.3/wk → "every 23d", 2.5/wk → "2.5×/wk" */
function rhythm(perWeek: number): string {
  if (perWeek <= 0) return "—";
  if (perWeek >= 1) return `${fmt1(perWeek)}×/wk`;
  return `every ${Math.round(7 / perWeek)}d`;
}

const channelDormant = (c: ChannelCadence) => c.archetypes.length === 0;
const channelPeer = (c: ChannelCadence) => {
  const peers = c.archetypes
    .map((a) => a.peerPerWeek)
    .filter((p): p is number => p != null);
  return peers.length ? peers.reduce((n, p) => n + p, 0) : null;
};
const channelStatus = (c: ChannelCadence): Status =>
  channelDormant(c) ? "dormant" : c.status;

// ---- the gauge -------------------------------------------------------------
function Gauge({
  obs,
  target,
  peer,
  status,
  unit,
}: {
  obs: number;
  target: number | null;
  peer: number | null;
  status: Status;
  unit?: string;
}) {
  const max =
    Math.max(obs, target ?? 0, peer ?? 0, unit === "%" ? 1 : 0.6) * 1.28;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  const s = STATUS[status];
  return (
    <span
      style={{
        position: "relative",
        display: "block",
        height: 8,
        borderRadius: 999,
        background: "var(--color-surface-tertiary)",
        overflow: "visible",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: pct(obs),
          borderRadius: 999,
          background: s.muted
            ? `color-mix(in oklab, ${s.color} 65%, var(--color-neutral-450))`
            : s.color,
          transition: "width 240ms ease",
        }}
      />
      {target != null && (
        <span
          title={`Target ${target}${unit ?? ""}`}
          style={{
            position: "absolute",
            left: pct(target),
            top: -3,
            bottom: -3,
            width: 2,
            marginLeft: -1,
            borderRadius: 1,
            background: "var(--color-primary)",
          }}
        />
      )}
      {peer != null && (
        <span
          title={`Peers ${peer}${unit ?? ""}`}
          style={{
            position: "absolute",
            left: pct(peer),
            top: -3,
            bottom: -3,
            marginLeft: -1,
            borderLeft: "2px dotted var(--color-secondary)",
          }}
        />
      )}
    </span>
  );
}

function GaugeLegend() {
  return (
    <span className="flex flex-wrap items-center gap-3">
      <span className="flex items-center gap-1.5">
        <span
          className="h-[7px] w-4 rounded-full"
          style={{ background: "var(--color-neutral-450)" }}
        />
        <span className="text-[10px] text-muted-foreground">observed</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-3 w-0.5 rounded-sm"
          style={{ background: "var(--color-primary)" }}
        />
        <span className="text-[10px] text-muted-foreground">target</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-3"
          style={{ borderLeft: "2px dotted var(--color-secondary)" }}
        />
        <span className="text-[10px] text-muted-foreground">peers</span>
      </span>
    </span>
  );
}

function PeerDelta({ obs, peer }: { obs: number; peer: number | null }) {
  if (peer == null) return null;
  const d = obs - peer;
  if (Math.abs(d) < 0.4) return null;
  const behind = d < 0;
  return (
    <span
      className="rounded-full px-1.5 py-px text-[10px] font-medium whitespace-nowrap"
      style={
        behind
          ? {
              color: "#f59e0b",
              background: "color-mix(in oklab, #f59e0b 12%, transparent)",
            }
          : {
              color: "var(--color-secondary)",
              background: "var(--color-surface-tertiary)",
            }
      }
    >
      {behind ? "−" : "+"}
      {Math.abs(d).toFixed(1)} vs peers
    </span>
  );
}

function StatusPill({ status, small }: { status: Status; small?: boolean }) {
  const s = STATUS[status];
  const muted =
    status === "on" || status === "dormant" || status === "untracked";
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span
        className={cn(
          "shrink-0 rounded-full",
          small ? "size-[5px]" : "size-1.5",
        )}
        style={{ background: s.color }}
      />
      <span
        className={cn(small ? "text-[10px]" : "text-[11px]", "font-medium")}
        style={{ color: muted ? "var(--muted-foreground)" : s.color }}
      >
        {s.label}
      </span>
    </span>
  );
}

function Nums({
  obs,
  target,
  peer,
  unit,
}: {
  obs: number;
  target: number | null;
  peer: number | null;
  unit?: string;
}) {
  const u = unit ?? "";
  const show = (v: number) => (unit === "%" ? v : fmt1(v));
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums">
      <span className="text-[12.5px] font-semibold text-foreground">
        {show(obs)}
        {u}
      </span>
      <span className="text-[10px] text-muted-foreground">
        / {target == null ? "—" : `${target}${u}`}
        {peer == null ? "" : ` / ${show(peer)}${u} peer`}
      </span>
    </span>
  );
}

// ---- inline target slider (edit mode) --------------------------------------
function TargetSlider({
  obs,
  target,
  onCommit,
  pending,
}: {
  obs: number;
  target: number | null;
  onCommit: (n: number) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState(target ?? 0);
  return (
    <span className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground">
        {rhythm(obs)} now · target
      </span>
      <span className="inline-flex items-baseline gap-0.5">
        <span className="text-[12.5px] font-semibold tabular-nums">
          {draft === 0 ? "—" : fmt1(draft)}
        </span>
        <span className="text-[10px] text-muted-foreground">/wk</span>
      </span>
      <input
        type="range"
        min={0}
        max={6}
        step={0.5}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => draft !== (target ?? 0) && onCommit(draft)}
        onKeyUp={() => draft !== (target ?? 0) && onCommit(draft)}
        className="st-range"
      />
    </span>
  );
}

// ---- verdict strip ---------------------------------------------------------
function Verdict({ strategy }: { strategy: BrandStrategy }) {
  const { channels } = strategy;
  const live = channels.filter((c) => !channelDormant(c));
  const on = live.filter((c) => c.status === "on").length;
  const under = live.filter((c) => c.status === "under").length;
  const over = live.filter((c) => c.status === "over").length;
  const dormant = channels.length - live.length;

  // biggest short-form-video gap vs peers, summed across channels
  let gapObs = 0,
    gapPeer = 0;
  for (const c of channels)
    for (const a of c.archetypes)
      if (a.archetype === "video_short" && a.peerPerWeek != null) {
        gapObs += a.observedPerWeek;
        gapPeer += a.peerPerWeek;
      }
  const gap = gapPeer - gapObs;
  const hasGap = gap > 0.4;

  // biggest over-publish (obs - target), for the second callout
  let overTop: { label: string; delta: number } | null = null;
  for (const c of channels)
    for (const a of c.archetypes)
      if (a.status === "over" && a.target != null) {
        const delta = a.observedPerWeek - a.target;
        if (!overTop || delta > overTop.delta)
          overTop = {
            label: `${chMeta(c.platform).short} · ${archLabel(a.archetype)}`,
            delta,
          };
      }

  const headline =
    under > 0
      ? `Off strategy on cadence — ${under} ${under === 1 ? "channel" : "channels"} under-pace${hasGap ? ", and short-form video is the gap" : ""}.`
      : over > 0
        ? `On pace, but over-publishing on ${overTop?.label ?? "some channels"}.`
        : `On strategy — all ${on} live ${on === 1 ? "channel" : "channels"} on pace.`;
  const headColor = under > 0 ? "#f59e0b" : over > 0 ? "#0ea5e9" : "#10b981";

  const pills = [
    { n: on, label: "on pace", color: "#10b981" },
    { n: under, label: "behind", color: "#f59e0b" },
    { n: over, label: "over", color: "#0ea5e9" },
    { n: dormant, label: "dormant", color: "var(--color-neutral-450)" },
  ].filter((p) => p.n > 0);

  return (
    <div className="mb-4 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3.5">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: headColor }}
        />
        <span className="text-[15.5px] font-semibold tracking-tight">
          {headline}
        </span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {pills.map((p) => (
            <span
              key={p.label}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{ background: "var(--color-surface-tertiary)" }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: p.color }}
              />
              <span className="text-[11px] font-semibold tabular-nums">
                {p.n}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {p.label}
              </span>
            </span>
          ))}
        </span>
      </div>
      {(hasGap || overTop) && (
        <div className="mt-3 flex flex-wrap gap-2.5">
          {hasGap && (
            <div
              className="flex flex-1 basis-[280px] items-center gap-3 rounded-xl px-3 py-2.5"
              style={{
                background: "color-mix(in oklab, #f59e0b 9%, transparent)",
              }}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: "#f59e0b" }}
                >
                  Biggest gap vs peers · Short-form video
                </span>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  You post {gapObs.toFixed(1)}/wk across IG + TikTok; peers run{" "}
                  {gapPeer.toFixed(1)}/wk.
                </span>
              </span>
              <span
                className="ml-auto text-[14px] font-semibold whitespace-nowrap tabular-nums"
                style={{ color: "#f59e0b" }}
              >
                −{gap.toFixed(1)}/wk
              </span>
              <Link href="/app/plan" className="lg-pill shrink-0">
                Seed slots →
              </Link>
            </div>
          )}
          {overTop && (
            <div
              className="flex flex-1 basis-[280px] items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: "var(--color-surface-tertiary)" }}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[11px] font-semibold">
                  Over-publishing · {overTop.label}
                </span>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  Capacity you could shift to where you&apos;re behind.
                </span>
              </span>
              <span
                className="ml-auto text-[14px] font-semibold whitespace-nowrap tabular-nums"
                style={{ color: "#0ea5e9" }}
              >
                +{overTop.delta.toFixed(1)}/wk
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- channel card ----------------------------------------------------------
function ChannelCard({
  c,
  editing,
  onSetCadence,
  pending,
  brandId,
  brandName,
  backfill,
}: {
  c: ChannelCadence;
  editing: boolean;
  brandId: string;
  brandName: string;
  backfill: ChannelBackfillState | null;
  onSetCadence: (args: {
    channelId: string;
    archetype: string;
    count: number;
  }) => void;
  pending: boolean;
}) {
  const meta = chMeta(c.platform);
  const dormant = channelDormant(c);
  const status = channelStatus(c);
  const peer = channelPeer(c);
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* header */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3",
          !dormant && "border-b",
        )}
      >
        <span
          className="inline-flex h-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tracking-wide"
          style={{
            width: meta.wide ? 30 : 24,
            background: `color-mix(in oklab, ${meta.hue} 14%, transparent)`,
            color: meta.hue,
          }}
        >
          <ChannelLogo platform={c.platform} className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[13.5px] font-semibold">{meta.short}</span>
          {c.handle && (
            <span className="text-[10px] text-muted-foreground">
              {c.handle}
            </span>
          )}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-3.5">
          {!dormant && <PeerDelta obs={c.observedPerWeek} peer={peer} />}
          {!dormant && (
            <span className="text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
              {rhythm(c.observedPerWeek)}
              {c.targetPerWeek != null && (
                <span className="text-muted-foreground">
                  {" "}
                  · target {rhythm(c.targetPerWeek)}
                </span>
              )}
            </span>
          )}
          <StatusPill status={status} />
        </span>
      </div>
      {/* archetype rows */}
      {dormant ? (
        <div className="flex items-center gap-2.5 px-4 py-3">
          <span className="text-[11px] text-muted-foreground">
            No posts in this window.
          </span>
        </div>
      ) : (
        <div>
          {c.archetypes.map((a, i) => (
            <div
              key={a.archetype}
              className={cn(
                "st-row grid grid-cols-[160px_1fr_210px] items-center gap-4 px-4 py-2.5",
                i > 0 && "border-t",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: STATUS[a.status].color }}
                />
                <span className="truncate text-[12.5px] font-medium">
                  {archLabel(a.archetype)}
                </span>
              </span>
              {editing ? (
                <TargetSlider
                  obs={a.observedPerWeek}
                  target={a.target}
                  pending={pending}
                  onCommit={(n) =>
                    onSetCadence({
                      channelId: c.channelId,
                      archetype: a.archetype,
                      count: n,
                    })
                  }
                />
              ) : (
                <Gauge
                  obs={a.observedPerWeek}
                  target={a.target}
                  peer={a.peerPerWeek}
                  status={a.status}
                />
              )}
              <span className="flex items-center justify-end gap-2.5">
                {!editing && (
                  <PeerDelta obs={a.observedPerWeek} peer={a.peerPerWeek} />
                )}
                <Nums
                  obs={a.observedPerWeek}
                  target={a.target}
                  peer={a.peerPerWeek}
                />
              </span>
            </div>
          ))}
        </div>
      )}
      {/* what has been pulled + on-demand pull controls */}
      {backfill && (
        <ChannelBackfill
          brandId={brandId}
          brandName={brandName}
          state={backfill}
        />
      )}
    </div>
  );
}

// ---- content mix -----------------------------------------------------------
function MixCard({
  strategy,
  editing,
  onSetMix,
  onToggleEdit,
  pending,
}: {
  strategy: BrandStrategy;
  editing: boolean;
  onSetMix: (args: { pillar: string; targetPct: number }) => void;
  /** When set, MixCard owns its edit toggle (the standalone Strategy page). */
  onToggleEdit?: () => void;
  pending: boolean;
}) {
  const classified = strategy.mix.filter((m) => m.pillar !== "__unsorted");

  // recruiting empty state — posts aren't classified into pillars yet
  if (classified.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-baseline justify-between border-b px-4 py-3">
          <span className="text-[13.5px] font-semibold">Content mix</span>
          <span className="text-[10px] text-muted-foreground">by pillar</span>
        </div>
        <div className="flex flex-col gap-2.5 px-4 py-4">
          <span className="text-[12.5px] font-semibold">
            Your content isn&apos;t classified yet
          </span>
          <span className="max-w-prose text-[11px] leading-relaxed text-muted-foreground">
            100% of posts in this window are{" "}
            <strong className="text-foreground">Unsorted</strong>. Classify them
            into pillars to see your mix, set targets, and benchmark against
            peers.
          </span>
          <span className="mt-0.5 flex gap-2">
            <Link href="/app/content" className="lg-pill lg-pill-on">
              Classify content →
            </Link>
            <button className="lg-pill" disabled title="Coming soon">
              Auto-classify with AI
            </button>
          </span>
        </div>
      </div>
    );
  }

  const rank: Record<string, number> = {
    under: 0,
    over: 1,
    on: 2,
    untracked: 3,
  };
  const sorted = [...classified].sort(
    (a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
      (b.targetPct ?? 0) - b.pct - ((a.targetPct ?? 0) - a.pct),
  );
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-baseline justify-between border-b px-4 py-3">
        <span className="text-[13.5px] font-semibold">
          Content mix{" "}
          <span className="font-normal text-muted-foreground">· by pillar</span>
        </span>
        <span className="flex items-center gap-3">
          <GaugeLegend />
          {onToggleEdit && (
            <button
              onClick={onToggleEdit}
              className={editing ? "lg-pill lg-pill-on" : "lg-pill"}
            >
              {editing ? "Done" : "Edit targets"}
            </button>
          )}
        </span>
      </div>
      <div>
        {sorted.map((m, i) => {
          const meta = pillarMeta(m.pillar);
          return (
            <div
              key={m.pillar}
              className={cn(
                "st-row grid grid-cols-[160px_1fr_210px] items-center gap-4 px-4 py-2.5",
                i > 0 && "border-t",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ background: meta.color }}
                />
                <span className="truncate text-[12.5px] font-medium">
                  {meta.name}
                </span>
              </span>
              {editing ? (
                <span className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {m.pct}% now · target
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={m.targetPct ?? 0}
                    disabled={pending}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n) && n !== (m.targetPct ?? 0))
                        onSetMix({ pillar: m.pillar, targetPct: n });
                    }}
                    className="h-6 w-14 rounded border bg-background px-1.5 text-right text-[12.5px] tabular-nums"
                  />
                  <span className="text-[10px] text-muted-foreground">%</span>
                </span>
              ) : (
                <Gauge
                  obs={m.pct}
                  target={m.targetPct}
                  peer={m.peerPct}
                  status={m.status}
                  unit="%"
                />
              )}
              <span className="flex items-center justify-end gap-2.5">
                {!editing && <PeerDelta obs={m.pct} peer={m.peerPct} />}
                <Nums
                  obs={m.pct}
                  target={m.targetPct}
                  peer={m.peerPct}
                  unit="%"
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- page ------------------------------------------------------------------
/**
 * The tactical monitoring view: a cadence verdict and the per-channel gauges.
 * Lives on the brand-map cockpit. The strategic decisions (pillars, personas)
 * are their own page — see BrandContentMix and /app/brands/[slug]/strategy.
 */
export function BrandCadence({
  brandId,
  brandName,
  strategy,
  backfill = {},
}: {
  brandId: string;
  brandName: string;
  strategy: BrandStrategy;
  /** Per-platform ingest facts + pull controls (see ChannelBackfill). */
  backfill?: Record<string, ChannelBackfillState>;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = () => router.refresh();

  const [sort, setSort] = useState<"attention" | "volume">("attention");
  const [editing, setEditing] = useState(false);

  const setCadence = useMutation(
    trpc.cadence.setCadenceTarget.mutationOptions({ onSuccess: refresh }),
  );

  const attnRank: Record<Status, number> = {
    under: 0,
    over: 1,
    on: 2,
    untracked: 2,
    dormant: 3,
  };
  const sorted = [...strategy.channels].sort((a, b) => {
    if (sort === "attention") {
      const r = attnRank[channelStatus(a)] - attnRank[channelStatus(b)];
      if (r) return r;
      const ga = (channelPeer(a) ?? 0) - a.observedPerWeek;
      const gb = (channelPeer(b) ?? 0) - b.observedPerWeek;
      return gb - ga;
    }
    return b.observedPerWeek - a.observedPerWeek;
  });

  return (
    <div className="space-y-5">
      <Verdict strategy={strategy} />

      <div className="flex items-center gap-3">
        <h2 className="text-[15px] font-semibold">Channel cadence</h2>
        <span className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">Sort</span>
          <div className="inline-flex rounded-full bg-muted/50 p-0.5 text-[11px]">
            {(["attention", "volume"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setSort(v)}
                className={cn(
                  "rounded-full px-2.5 py-1 font-medium capitalize transition-colors",
                  sort === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {v === "attention" ? "Needs attention" : "Volume"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setEditing((e) => !e)}
            className={editing ? "lg-pill lg-pill-on" : "lg-pill"}
          >
            {editing ? "Done" : "Edit targets"}
          </button>
        </span>
      </div>
      <div className="-mt-1">
        <GaugeLegend />
      </div>
      <div className="flex flex-col gap-3">
        {sorted.map((c) => (
          <ChannelCard
            key={c.channelId}
            c={c}
            editing={editing}
            brandId={brandId}
            brandName={brandName}
            backfill={backfill[c.platform] ?? null}
            pending={setCadence.isPending}
            onSetCadence={(args) =>
              setCadence.mutate({ brandId, period: "week", ...args })
            }
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The strategic decision: the content mix by pillar with its target sliders.
 * Owns its own edit toggle so it can stand alone on the Strategy page.
 */
export function BrandContentMix({
  brandId,
  strategy,
}: {
  brandId: string;
  strategy: BrandStrategy;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const setMix = useMutation(
    trpc.cadence.setMixTarget.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  return (
    <MixCard
      strategy={strategy}
      editing={editing}
      onToggleEdit={() => setEditing((e) => !e)}
      pending={setMix.isPending}
      onSetMix={({ pillar, targetPct }) =>
        setMix.mutate({ brandId, pillar, targetPct, period: "week" })
      }
    />
  );
}
