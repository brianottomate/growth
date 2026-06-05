"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, useState } from "react";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { SimpleDialog } from "@/components/ui/dialog";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import { useFullBleed } from "@/lib/use-full-bleed";

export type FeedEntry = {
  id: string;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  platform: string;
  handle: string | null;
  contentPostId: string | null;
  title: string | null;
  pillar: string | null;
  seriesName: string | null;
  seriesColor: string | null;
  text: string | null;
  status: string;
  isSeed: boolean;
  via: string | null;
  externalUrl: string | null;
  stats: Record<string, number> | null;
  mediaUrl: string | null;
  at: string; // ISO — publishedAt ?? scheduledAt
  published: boolean;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  published: { label: "Published", cls: "bg-emerald-500/15 text-emerald-300" },
  scheduled: { label: "Scheduled", cls: "bg-sky-500/15 text-sky-300" },
  approved: { label: "Needs schedule", cls: "bg-amber-500/15 text-amber-300" },
  draft: { label: "Draft", cls: "bg-black/40 text-white/80" },
};

const VIA: Record<string, string> = {
  zernio: "Zernio",
  customerio: "Customer.io",
  native: "Static publish",
  manual: "Manual",
};

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;

function statLine(stats: Record<string, number> | null): string | null {
  if (!stats) return null;
  if (stats.likes != null) return `${fmt(stats.likes)} likes`;
  if (stats.views != null) return `${fmt(stats.views)} views`;
  if (stats.comments != null) return `${fmt(stats.comments)} comments`;
  return null;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const fmtTime = (d: Date) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDay = (d: Date) =>
  d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

// ---- content grouping ----------------------------------------------

type ContentGroup = {
  key: string;
  contentPostId: string | null;
  title: string | null;
  pillarSlug: string | null;
  seriesName: string | null;
  seriesColor: string | null;
  entries: FeedEntry[];
  at: number; // earliest ship time in the group
};

/** Cluster a day's entries by parent content; standalone posts stand alone. */
function groupByContent(entries: FeedEntry[]): ContentGroup[] {
  const byKey = new Map<string, ContentGroup>();
  for (const e of entries) {
    const key = e.contentPostId ?? `solo:${e.id}`;
    const t = new Date(e.at).getTime();
    const g = byKey.get(key);
    if (g) {
      g.entries.push(e);
      g.at = Math.min(g.at, t);
    } else {
      byKey.set(key, {
        key,
        contentPostId: e.contentPostId,
        title: e.title,
        pillarSlug: e.pillar,
        seriesName: e.seriesName,
        seriesColor: e.seriesColor,
        entries: [e],
        at: t,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.at - b.at);
}

function FilterPill({
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
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-foreground text-background border-foreground"
          : "border-border text-muted-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="border-border flex overflow-hidden rounded-full border">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            value === o.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NowMarker({ now }: { now: number }) {
  return (
    <div className="flex flex-none flex-col items-center gap-1.5 self-stretch px-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-400">
        now
      </span>
      <span className="size-2 rounded-full bg-sky-400" />
      <span className="w-0.5 flex-1 rounded bg-sky-400/40" />
      <span className="text-[10px] tabular-nums text-sky-400">
        {fmtTime(new Date(now))}
      </span>
    </div>
  );
}

// Lets any FeedCard (nested in groups or the flat list) open the spotlight
// without threading a callback through every intermediate component.
const SpotlightContext = createContext<(e: FeedEntry) => void>(() => undefined);

function FeedCard({ e }: { e: FeedEntry }) {
  const openSpotlight = useContext(SpotlightContext);
  const t = new Date(e.at);
  const pillar = e.pillar ? PILLAR_BY_SLUG[e.pillar] : null;
  const status = STATUS[e.status] ?? {
    label: e.status,
    cls: "bg-black/40 text-white/80",
  };
  const stat = statLine(e.stats);
  const via = e.via ? (VIA[e.via] ?? e.via) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openSpotlight(e)}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          openSpotlight(e);
        }
      }}
      className={`bg-card hover:border-foreground/30 focus-visible:ring-ring flex w-64 flex-none cursor-pointer flex-col overflow-hidden rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 ${
        e.published ? "opacity-90" : ""
      }`}
    >
      {/* media — falls back to a text-forward panel for posts with no
          (renderable) media, e.g. text-only updates, reshares, or media on a
          hotlink-blocked CDN. */}
      <div className="bg-muted relative h-36">
        {e.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={e.mediaUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="from-muted to-muted/30 flex h-full w-full items-center bg-gradient-to-br px-3 pb-2 pt-9">
            {e.text ? (
              <p className="text-foreground/80 line-clamp-4 text-[13px] font-medium leading-snug">
                {e.text}
              </p>
            ) : (
              <ChannelLogo
                platform={e.platform}
                className="m-auto size-8 opacity-30"
              />
            )}
          </div>
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1">
          {e.brandLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={e.brandLogo}
              alt=""
              className="size-6 rounded-md object-cover"
            />
          ) : (
            <span className="flex size-6 items-center justify-center rounded-md bg-black/40 text-[9px] font-semibold text-white backdrop-blur-sm">
              {e.brandName.slice(0, 2)}
            </span>
          )}
          <span className="rounded-md bg-black/30 p-1 backdrop-blur-sm">
            <ChannelLogo platform={e.platform} className="size-4" />
          </span>
        </div>
        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm ${status.cls}`}
        >
          {status.label}
        </span>
        {e.isSeed && (
          <span className="absolute right-2 top-8 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300 backdrop-blur-sm">
            Seed
          </span>
        )}
        {e.externalUrl && (
          <a
            href={e.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            title={`Open on ${platformLabel(e.platform)}`}
            aria-label={`Open on ${platformLabel(e.platform)}`}
            className="absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-md bg-black/40 text-xs text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            ↗
          </a>
        )}
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold tabular-nums">{fmtTime(t)}</span>
          <span className="bg-muted text-foreground flex size-4 items-center justify-center rounded text-[8px] font-semibold">
            {e.brandName.slice(0, 2)}
          </span>
          <span className="text-muted-foreground truncate">{e.handle}</span>
        </div>

        {e.mediaUrl && e.text && (
          <p className="line-clamp-2 min-h-[2.5rem] text-[13px] leading-snug">
            {e.text}
          </p>
        )}

        <div className="flex-1" />

        <div className="text-muted-foreground flex items-center gap-1.5 border-t pt-2 text-[11px]">
          {pillar && (
            <>
              <span
                className="size-1.5 rounded-full"
                style={{ background: pillar.color }}
              />
              <span className="truncate">{pillar.name}</span>
            </>
          )}
          <span className="flex-1" />
          {stat && <span className="tabular-nums">{stat}</span>}
        </div>
        {via && (
          <div className="text-muted-foreground/70 text-[10px]">via {via}</div>
        )}
      </div>
    </div>
  );
}

/** A parent-content cluster: header (→ content detail) + its platform cards. */
function ContentGroupBox({ g }: { g: ContentGroup }) {
  const pillar = g.pillarSlug ? PILLAR_BY_SLUG[g.pillarSlug] : null;
  return (
    <div className="border-border/70 bg-muted/[0.04] flex flex-none flex-col gap-2 rounded-2xl border border-dashed p-2.5">
      <Link
        href={`/app/content/${g.contentPostId}`}
        className="group flex items-center gap-2 px-1 text-xs"
      >
        <span className="max-w-[18rem] truncate font-medium group-hover:underline">
          {g.title ?? "Untitled"}
        </span>
        {pillar && (
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: pillar.color }}
            title={pillar.name}
          />
        )}
        {g.seriesName && (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background: `${g.seriesColor ?? "#64748b"}22`,
              color: g.seriesColor ?? "#94a3b8",
            }}
          >
            {g.seriesName}
          </span>
        )}
        <span className="text-muted-foreground/70 shrink-0">
          {g.entries.length}{" "}
          {g.entries.length === 1 ? "platform" : "platforms"}
        </span>
      </Link>
      <div className="flex gap-3">
        {g.entries.map((e) => (
          <FeedCard key={e.id} e={e} />
        ))}
      </div>
    </div>
  );
}

export function FeedClient({
  entries,
  brands,
  nowISO,
}: {
  entries: FeedEntry[];
  brands: { id: string; name: string }[];
  nowISO: string;
}) {
  const now = new Date(nowISO).getTime();
  const todayKey = dayKey(new Date(nowISO));

  const [brandFilter, setBrandFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "organic" | "paid">("all");
  const [view, setView] = useState<"grouped" | "all">("grouped");
  const [spot, setSpot] = useState<FeedEntry | null>(null);
  const { ref, style } = useFullBleed();

  const platforms = useMemo(
    () => [...new Set(entries.map((e) => e.platform))],
    [entries],
  );

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (brandFilter !== "all" && e.brandId !== brandFilter) return false;
        if (channelFilter !== "all" && e.platform !== channelFilter) return false;
        if (typeFilter === "paid") return false; // no ad spots yet
        return true;
      }),
    [entries, brandFilter, channelFilter, typeFilter],
  );

  // Group by day, newest day first; within a day, chronological (morning → evening).
  const days = useMemo(() => {
    const byDay = new Map<string, FeedEntry[]>();
    for (const e of filtered) {
      const k = dayKey(new Date(e.at));
      const list = byDay.get(k) ?? [];
      list.push(e);
      byDay.set(k, list);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0])) // newest day first
      .map(([k, list]) => ({
        key: k,
        today: k === todayKey,
        entries: list.sort(
          (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
        ),
      }));
  }, [filtered, todayKey]);

  return (
    <SpotlightContext.Provider value={setSpot}>
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Everything going out, newest first · {entries.length} posts
      </p>

      {/* filter bar */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-b pb-4">
        <Segmented
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "All" },
            { value: "organic", label: "Organic" },
            { value: "paid", label: "Paid" },
          ]}
        />
        <span className="bg-border mx-1 h-4 w-px" />
        <FilterPill active={brandFilter === "all"} onClick={() => setBrandFilter("all")}>
          All brands
        </FilterPill>
        {brands.map((b) => (
          <FilterPill
            key={b.id}
            active={brandFilter === b.id}
            onClick={() => setBrandFilter(b.id)}
          >
            {b.name}
          </FilterPill>
        ))}
        <span className="bg-border mx-1 h-4 w-px" />
        <FilterPill active={channelFilter === "all"} onClick={() => setChannelFilter("all")}>
          All channels
        </FilterPill>
        {platforms.map((p) => (
          <FilterPill
            key={p}
            active={channelFilter === p}
            onClick={() => setChannelFilter(p)}
          >
            {platformLabel(p)}
          </FilterPill>
        ))}
        <span className="flex-1" />
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "grouped", label: "Grouped" },
            { value: "all", label: "All posts" },
          ]}
        />
      </div>

      {/* timeline */}
      <div ref={ref} style={style} className="px-8 sm:px-0">
        {typeFilter === "paid" ? (
        <div className="text-muted-foreground py-16 text-center text-sm">
          Paid spots arrive with the ads schema — coming soon.
        </div>
      ) : days.length === 0 ? (
        <div className="text-muted-foreground py-16 text-center text-sm">
          Nothing for these filters.
        </div>
      ) : (
        days.map((d) => {
          const groups = view === "grouped" ? groupByContent(d.entries) : [];
          const nowGroupIdx =
            d.today && view === "grouped"
              ? (() => {
                  const i = groups.findIndex((g) => g.at > now);
                  return i === -1 ? groups.length : i;
                })()
              : -1;
          const nowIdx =
            d.today && view === "all"
              ? (() => {
                  const i = d.entries.findIndex(
                    (e) => new Date(e.at).getTime() > now,
                  );
                  return i === -1 ? d.entries.length : i;
                })()
              : -1;
          return (
            <div key={d.key} className="mt-6">
              <div className="mb-2.5 flex items-center gap-3">
                <span
                  className={`text-xs font-semibold ${
                    d.today
                      ? "bg-foreground text-background rounded-full px-2.5 py-1"
                      : "text-foreground"
                  }`}
                >
                  {fmtDay(new Date(d.key))}
                  {d.today ? " · today" : ""}
                </span>
                <span className="bg-border h-px flex-1" />
                <span className="text-muted-foreground text-[11px]">
                  {d.entries.length} item{d.entries.length === 1 ? "" : "s"}
                </span>
              </div>

              {view === "grouped" ? (
                <div className="flex items-start gap-4 overflow-x-auto pb-3">
                  {groups.map((g, i) => (
                    <span key={g.key} className="contents">
                      {i === nowGroupIdx && <NowMarker now={now} />}
                      {g.contentPostId ? (
                        <ContentGroupBox g={g} />
                      ) : (
                        g.entries.map((e) => <FeedCard key={e.id} e={e} />)
                      )}
                    </span>
                  ))}
                  {nowGroupIdx === groups.length && <NowMarker now={now} />}
                </div>
              ) : (
                <div className="flex items-stretch gap-3 overflow-x-auto pb-3">
                  {d.entries.map((e, i) => (
                    <span key={e.id} className="contents">
                      {i === nowIdx && <NowMarker now={now} />}
                      <FeedCard e={e} />
                    </span>
                  ))}
                  {nowIdx === d.entries.length && <NowMarker now={now} />}
                </div>
              )}
            </div>
          );
        })
      )}
      </div>
      <SpotlightDialog entry={spot} onClose={() => setSpot(null)} />
    </div>
    </SpotlightContext.Provider>
  );
}

/** In-app preview of a single post — media, full text, stats, link to original. */
function SpotlightDialog({
  entry,
  onClose,
}: {
  entry: FeedEntry | null;
  onClose: () => void;
}) {
  const stat = entry ? statLine(entry.stats) : null;
  const via = entry?.via ? (VIA[entry.via] ?? entry.via) : null;
  return (
    <SimpleDialog
      open={!!entry}
      onOpenChange={(o) => !o && onClose()}
      title={entry ? `${entry.brandName} · ${platformLabel(entry.platform)}` : ""}
      size="lg"
      scrollable
    >
      {entry && (
        <div className="flex flex-col gap-4">
          {entry.mediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.mediaUrl}
              alt=""
              className="bg-muted max-h-[55vh] w-full rounded-lg object-contain"
            />
          )}
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <ChannelLogo platform={entry.platform} className="size-4" />
            {entry.handle && <span>{entry.handle}</span>}
            <span>· {fmtDay(new Date(entry.at))} {fmtTime(new Date(entry.at))}</span>
            {via && <span>· via {via}</span>}
            {stat && <span className="tabular-nums">· {stat}</span>}
          </div>
          {entry.text && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {entry.text}
            </p>
          )}
          {entry.externalUrl && (
            <a
              href={entry.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-foreground text-background hover:bg-foreground/90 inline-flex w-fit items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium"
            >
              Open on {platformLabel(entry.platform)} ↗
            </a>
          )}
        </div>
      )}
    </SimpleDialog>
  );
}
