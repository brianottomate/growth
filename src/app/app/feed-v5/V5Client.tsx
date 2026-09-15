"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import {
  AlignLeft,
  Check,
  Eye,
  ExternalLink,
  Heart,
  Image as ImageIcon,
  Layers,
  MessageCircle,
  Play,
  Rocket,
  Text as TextIcon,
  X,
  type LucideIcon,
} from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { SimpleDialog } from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { PILLAR_BY_SLUG, PILLARS } from "@/lib/pillars";
import { getPlatformFormat } from "@/server/content/formats";
import { useFullBleed } from "@/lib/use-full-bleed";
import { PostDetailDialog } from "./PostDetailDialog";

// Cross-platform mechanic → short glanceable label (fallback when there's no
// concrete format). Format label ("Reel", "Carousel") wins when we have it.
const ARCHETYPE_LABEL: Record<string, string> = {
  image: "Image",
  carousel: "Carousel",
  video_short: "Short",
  video_long: "Video",
  text: "Text",
  thread: "Thread",
  story: "Story",
  link: "Link",
  article: "Article",
};

function postTypeLabel(
  format: string | null,
  archetype: string | null,
): string | null {
  if (format) return getPlatformFormat(format)?.label ?? null;
  if (archetype) return ARCHETYPE_LABEL[archetype] ?? null;
  return null;
}

// When media is missing/expired, we still know the format — so the placeholder
// *says what it is* (a Reel reads as a Reel) instead of looking broken.
const ARCHETYPE_ICON: Record<string, LucideIcon> = {
  image: ImageIcon,
  carousel: Layers,
  video_short: Play,
  video_long: Play,
  story: Play,
  text: AlignLeft,
  thread: AlignLeft,
  link: ExternalLink,
  article: TextIcon,
};

// Canonical channel order — so a spot for the same channel always sits in the
// same left→right position inside a tray (your eye learns the geography:
// visual-feed-ish left, longform/owned right).
const CHANNEL_ORDER = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "threads",
  "x",
  "linkedin",
  "newsletter",
  "blog",
];
const channelRank = (p: string) => {
  const i = CHANNEL_ORDER.indexOf(p);
  return i === -1 ? CHANNEL_ORDER.length : i;
};

// A repost/retweet is amplified volume, not new output — mute it.
const isRepost = (e: V5Entry) =>
  e.externalKind === "repost" || e.externalKind === "retweet";

// The lens: focus one idea (a content_post) or one series, dimming everything
// else across the whole board.
type Focus = { kind: "idea" | "series"; key: string; label: string } | null;

// Strategy-row format families (the dot strip + dominant read), mapped from
// archetype. Mirrors the design's ST_COLS.
const STRAT_FAMILIES = [
  { id: "reel", label: "Reel" },
  { id: "story", label: "Story" },
  { id: "video", label: "Video" },
  { id: "carousel", label: "Carousel" },
  { id: "image", label: "Image" },
  { id: "long", label: "Longform" },
  { id: "text", label: "Text" },
] as const;
const FAMILY_OF: Record<string, string> = {
  video_short: "reel",
  story: "story",
  video_long: "video",
  carousel: "carousel",
  image: "image",
  article: "long",
  text: "text",
  thread: "text",
  link: "text",
};

// Performance mode — true when "Performance" is selected. Surfaces engagement on
// cards, sorts top performers up, and switches the strategy row to a reach read.
const MetricsCtx = createContext(false);
const fmtNum = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;
// One comparable number per post: views if we have them, else likes + comments.
const engagementOf = (e: V5Entry) =>
  e.views > 0 ? e.views : e.likes + e.comments;
const engagementLabel = (e: V5Entry) =>
  e.views > 0
    ? `${fmtNum(e.views)} views`
    : e.likes + e.comments > 0
      ? `${fmtNum(e.likes)} likes`
      : null;

export type V5Role = "owned" | "competitor" | "inspiration";

export type V5Brand = {
  id: string;
  name: string;
  logo: string | null;
  role: V5Role;
};

export type V5Media = {
  url: string;
  type: "image" | "video" | "carousel";
  thumbnail?: string;
  width?: number;
  height?: number;
};

export type V5Entry = {
  id: string;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  role: V5Role;
  platform: string;
  format: string | null; // concrete platform format, e.g. "instagram.reel"
  archetype: string | null; // publish mechanic, e.g. "video_short"
  handle: string | null;
  contentPostId: string | null;
  title: string | null;
  pillar: string | null;
  seriesName: string | null;
  seriesColor: string | null;
  text: string | null;
  status: string;
  externalUrl: string | null;
  externalKind: string | null;
  mediaUrl: string | null;
  media: V5Media[];
  likes: number;
  comments: number;
  views: number;
  at: string; // ISO — published ?? scheduled ?? created
};

const PostOpenCtx = createContext<(entry: V5Entry) => void>(() => undefined);

// A pending AI grouping proposal (content_suggestion kind="grouping") — the
// server passes these so the timeline can offer "accept this grouping" inline.
export type V5Suggestion = {
  id: string;
  title: string;
  groupKind: string;
  unit: "single" | "series";
  memberIds: string[];
};

// ---- date helpers (local time) -------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
const dayKeyOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Monday-of-week key, for the week-boundary strategy row. */
const weekKeyOf = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return dayKeyOf(x);
};
const fmtDay = (d: Date) =>
  d.toLocaleDateString([], { month: "short", day: "numeric" });
const fmtWeekday = (d: Date) => d.toLocaleDateString([], { weekday: "short" });
const fmtMonthYear = (d: Date) =>
  d.toLocaleDateString([], { month: "long", year: "numeric" });
/** ISO week number (1–53). */
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // nearest Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  firstThu.setUTCDate(
    firstThu.getUTCDate() - ((firstThu.getUTCDay() + 6) % 7) + 3,
  );
  return 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86_400_000));
}

const STATUS_DOT: Record<string, string> = {
  published: "bg-emerald-500",
  scheduled: "bg-sky-500",
  approved: "bg-amber-500",
  pending_review: "bg-amber-500",
  draft: "bg-slate-400",
  discovered: "bg-violet-400",
};

const ROLE_BADGE: Record<V5Role, { label: string; cls: string }> = {
  owned: { label: "You", cls: "bg-emerald-500/15 text-emerald-300" },
  competitor: { label: "Competitor", cls: "bg-amber-500/15 text-amber-300" },
  inspiration: { label: "Inspiration", cls: "bg-sky-500/15 text-sky-300" },
};

// One content piece in a cell: a master idea + its platform spots (throughline),
// or a single standalone/scraped post.
type Group = {
  key: string;
  contentPostId: string | null;
  entries: V5Entry[];
};

function groupEntries(entries: V5Entry[]): Group[] {
  const byKey = new Map<string, Group>();
  for (const e of entries) {
    const key = e.contentPostId ?? `solo:${e.id}`;
    const g = byKey.get(key);
    if (g) g.entries.push(e);
    else byKey.set(key, { key, contentPostId: e.contentPostId, entries: [e] });
  }
  return [...byKey.values()];
}

type LaneAxis = "brand" | "pillar" | "channel";
type Lane = {
  key: string;
  label: string;
  logo: string | null;
  role: V5Role | null;
  color: string | null;
  platform: string | null;
};

// ==========================================================================

export function V5Client({
  brands,
  entries,
  nowISO,
}: {
  brands: V5Brand[];
  entries: V5Entry[];
  // Accepted but not yet rendered — timeline injection of pending groupings
  // is the next step on this surface.
  suggestions: V5Suggestion[];
  nowISO: string;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const { ref, style } = useFullBleed();

  const [axis, setAxis] = useState<LaneAxis>("brand");
  // In-cell grouping: by content idea (trays) or by channel (sub-headers).
  const [cellMode, setCellMode] = useState<"content" | "channel">("content");
  // Creative (default) vs Performance (engagement overlay) lens.
  const [metricsMode, setMetricsMode] = useState<"creative" | "performance">(
    "creative",
  );
  // Time window: N months of past (the timeline is retrospective — no future).
  // "Load older" adds 3mo.
  const [pastMonths, setPastMonths] = useState(2);
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  // Brand filter — default everything on.
  const [brandSel, setBrandSel] = useState<Set<string>>(
    () => new Set(brands.map((b) => b.id)),
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [focus, setFocus] = useState<Focus>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupUnit, setGroupUnit] = useState<"single" | "series">("single");
  const [postId, setPostId] = useQueryState(
    "post",
    parseAsString.withOptions({ history: "push" }),
  );
  const detail = useMemo(
    () => entries.find((entry) => entry.id === postId) ?? null,
    [entries, postId],
  );
  const openPost = useCallback(
    (entry: V5Entry) => void setPostId(entry.id),
    [setPostId],
  );

  const ownedFirst = useMemo(
    () =>
      [...brands].sort(
        (a, b) => (a.role === "owned" ? 0 : 1) - (b.role === "owned" ? 0 : 1),
      ),
    [brands],
  );

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (!brandSel.has(e.brandId)) return false;
        if (statusFilter !== "all" && e.status !== statusFilter) return false;
        if (channelFilter !== "all" && e.platform !== channelFilter)
          return false;
        if (typeFilter !== "all" && e.archetype !== typeFilter) return false;
        return true;
      }),
    [entries, brandSel, statusFilter, channelFilter, typeFilter],
  );

  // Filter option lists (present in the data).
  const statusOptions = useMemo(
    () => [...new Set(entries.map((e) => e.status))].sort(),
    [entries],
  );
  const channelOptions = useMemo(
    () => [...new Set(entries.map((e) => e.platform))].sort(),
    [entries],
  );
  const typeOptions = useMemo(
    () =>
      [
        ...new Set(
          entries.map((e) => e.archetype).filter((a): a is string => !!a),
        ),
      ].sort(),
    [entries],
  );

  // Window: everything from `cutoff` onward (so all future + `pastMonths` back).
  const cutoff = useMemo(() => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - pastMonths);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now, pastMonths]);
  const windowed = useMemo(
    () => filtered.filter((e) => new Date(e.at) >= cutoff),
    [filtered, cutoff],
  );
  const hasOlder = useMemo(
    () => filtered.some((e) => new Date(e.at) < cutoff),
    [filtered, cutoff],
  );

  // Lanes (columns) for the current axis.
  const lanes = useMemo<Lane[]>(() => {
    if (axis === "brand") {
      return ownedFirst
        .filter((b) => brandSel.has(b.id))
        .map((b) => ({
          key: b.id,
          label: b.name,
          logo: b.logo,
          role: b.role,
          color: null,
          platform: null,
        }));
    }
    if (axis === "pillar") {
      const present = new Set(filtered.map((e) => e.pillar ?? "__none"));
      const out: Lane[] = PILLARS.filter((p) => present.has(p.slug)).map(
        (p) => ({
          key: p.slug,
          label: p.name,
          logo: null,
          role: null,
          color: p.color,
          platform: null,
        }),
      );
      if (present.has("__none"))
        out.push({
          key: "__none",
          label: "Unsorted",
          logo: null,
          role: null,
          color: null,
          platform: null,
        });
      return out;
    }
    // channel
    const platforms = [...new Set(filtered.map((e) => e.platform))].sort();
    return platforms.map((p) => ({
      key: p,
      label: platformLabel(p),
      logo: null,
      role: null,
      color: null,
      platform: p,
    }));
  }, [axis, ownedFirst, brandSel, filtered]);

  const laneKeyOf = (e: V5Entry): string =>
    axis === "brand"
      ? e.brandId
      : axis === "pillar"
        ? (e.pillar ?? "__none")
        : e.platform;

  // Day rows (descending — newest first). Only days that actually have posts
  // are rendered (plus today), so the grid stays bounded.
  const { days, cells, weekLane } = useMemo(() => {
    const cellMap = new Map<string, V5Entry[]>();
    const weekMap = new Map<string, V5Entry[]>(); // `${weekKey}|${lane}` → entries
    const daySet = new Set<string>([dayKeyOf(now)]);
    for (const e of windowed) {
      const d = new Date(e.at);
      const dk = dayKeyOf(d);
      daySet.add(dk);
      const lk = laneKeyOf(e);
      const ck = `${dk}|${lk}`;
      (cellMap.get(ck) ?? cellMap.set(ck, []).get(ck)!).push(e);
      const wk = `${weekKeyOf(d)}|${lk}`;
      (weekMap.get(wk) ?? weekMap.set(wk, []).get(wk)!).push(e);
    }
    const dayList = [...daySet].sort((a, b) => (a < b ? 1 : -1)); // desc
    return { days: dayList, cells: cellMap, weekLane: weekMap };
    // oxlint-disable-next-line react/exhaustive-deps
  }, [windowed, axis, now]);

  const selectedEntries = useMemo(
    () => filtered.filter((e) => selected.has(e.id)),
    [filtered, selected],
  );

  const createGrouping = useMutation(
    trpc.content.createGrouping.mutationOptions({
      onSuccess: () => {
        setSelected(new Set());
        setGroupOpen(false);
        setGroupTitle("");
        router.refresh();
      },
    }),
  );

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  // Lens — clicking an idea title or a series chip focuses it (toggles off if
  // it's already the focus). An entry is "in focus" when it belongs.
  const setIdeaFocus = (key: string, label: string) =>
    setFocus((f) =>
      f?.kind === "idea" && f.key === key ? null : { kind: "idea", key, label },
    );
  const setSeriesFocus = (key: string, label: string) =>
    setFocus((f) =>
      f?.kind === "series" && f.key === key
        ? null
        : { kind: "series", key, label },
    );
  const inFocus = (e: V5Entry) =>
    !focus
      ? true
      : focus.kind === "idea"
        ? e.contentPostId === focus.key
        : e.seriesName === focus.key;
  const focusCount = useMemo(
    () => (focus ? windowed.filter(inFocus).length : 0),
    // oxlint-disable-next-line react/exhaustive-deps
    [focus, windowed],
  );

  const sendToLaunch = () => {
    const sel = selectedEntries;
    if (!sel.length) return;
    const owned = sel.find((e) => e.role === "owned");
    const params = new URLSearchParams();
    if (owned) params.set("brandId", owned.brandId);
    params.set(
      "prompt",
      `Riff on ${sel.length} selected post${sel.length > 1 ? "s" : ""} from the timeline.`,
    );
    const imgs = [
      ...new Set(sel.map((e) => e.mediaUrl).filter((u): u is string => !!u)),
    ].slice(0, 6);
    for (const u of imgs) params.append("img", u);
    router.push(`/app/plan?${params.toString()}`);
  };

  const allBrandsOn = brandSel.size === brands.length;

  return (
    <PostOpenCtx.Provider value={openPost}>
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {windowed.length} posts · {lanes.length} lanes · {days.length}{" "}
              days
              {hasOlder && (
                <span className="text-muted-foreground/60">
                  {" "}
                  · {filtered.length} all-time
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {focus && (
              <button
                onClick={() => setFocus(null)}
                className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
              >
                <span className="opacity-70">
                  {focus.kind === "series" ? "Series" : "Idea"}:
                </span>
                <span className="max-w-[14rem] truncate">{focus.label}</span>
                <span className="text-emerald-400/70 tabular-nums">
                  · {focusCount}
                </span>
                <X className="size-3.5" />
              </button>
            )}
            <span className="ml-1 text-xs text-muted-foreground">Lanes</span>
            <Segmented
              value={axis}
              onChange={setAxis}
              options={[
                { value: "brand", label: "Brand" },
                { value: "pillar", label: "Pillar" },
                { value: "channel", label: "Channel" },
              ]}
            />
            <span className="ml-1 text-xs text-muted-foreground">Group</span>
            <Segmented
              value={cellMode}
              onChange={setCellMode}
              options={[
                { value: "content", label: "Ideas" },
                { value: "channel", label: "Channels" },
              ]}
            />
            <span className="ml-1 text-xs text-muted-foreground">View</span>
            <Segmented
              value={metricsMode}
              onChange={setMetricsMode}
              options={[
                { value: "creative", label: "Creative" },
                { value: "performance", label: "Performance" },
              ]}
            />
          </div>
        </div>

        {/* Brand filter chips */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b pb-4">
          <span className="mr-1 text-xs text-muted-foreground">Brands</span>
          <button
            onClick={() => setBrandSel(new Set(brands.map((b) => b.id)))}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs transition-colors",
              allBrandsOn
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            All
          </button>
          <button
            onClick={() =>
              setBrandSel(
                new Set(
                  brands.filter((b) => b.role === "owned").map((b) => b.id),
                ),
              )
            }
            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            Only owned
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
          {ownedFirst.map((b) => {
            const on = brandSel.has(b.id);
            return (
              <button
                key={b.id}
                onClick={() =>
                  setBrandSel((prev) => {
                    const next = new Set(prev);
                    if (next.has(b.id)) {
                      next.delete(b.id);
                    } else {
                      next.add(b.id);
                    }
                    return next;
                  })
                }
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  on
                    ? "border-foreground/30 bg-accent"
                    : "border-border text-muted-foreground/60 hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    on ? ROLE_BADGE[b.role].cls : "bg-muted",
                  )}
                />
                {b.name}
              </button>
            );
          })}
          <span className="mx-1 h-4 w-px bg-border" />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            allLabel="All statuses"
            options={statusOptions.map((s) => ({
              value: s,
              label: s.replace(/_/g, " "),
            }))}
          />
          <FilterSelect
            value={channelFilter}
            onChange={setChannelFilter}
            allLabel="All channels"
            options={channelOptions.map((p) => ({
              value: p,
              label: platformLabel(p),
            }))}
          />
          <FilterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            allLabel="All types"
            options={typeOptions.map((a) => ({
              value: a,
              label: ARCHETYPE_LABEL[a] ?? a,
            }))}
          />
        </div>

        {/* Swimlane grid — time flows down, lanes are columns. */}
        <MetricsCtx.Provider value={metricsMode === "performance"}>
          <div ref={ref} style={style} className="mt-5 px-8 sm:px-0">
            {lanes.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No lanes — turn on a brand above.
              </p>
            ) : (
              <div className="max-h-[calc(100vh-9rem)] overflow-auto rounded-xl border">
                <div
                  className="grid min-w-max"
                  style={{
                    gridTemplateColumns: `7rem repeat(${lanes.length}, 26rem)`,
                  }}
                >
                  {/* Header row — sticks to the top; corner sticks to top+left. */}
                  <div className="sticky top-0 left-0 z-30 border-r border-b bg-muted" />
                  {lanes.map((l) => (
                    <LaneHeader key={l.key} lane={l} />
                  ))}

                  {/* Day rows (with a month divider whenever the month changes) */}
                  {days.map((dk, i) => {
                    const date = new Date(`${dk}T00:00:00`);
                    const prev =
                      i > 0 ? new Date(`${days[i - 1]}T00:00:00`) : null;
                    const newMonth =
                      prev?.getMonth() !== date.getMonth() ||
                      prev.getFullYear() !== date.getFullYear();
                    const isToday = dk === dayKeyOf(now);
                    // A week ends (its strategy subtotal renders below) when the
                    // next, older day belongs to a different week.
                    const wk = weekKeyOf(date);
                    const nextWk =
                      i < days.length - 1
                        ? weekKeyOf(new Date(`${days[i + 1]}T00:00:00`))
                        : null;
                    const weekEnds = nextWk !== wk;
                    return (
                      <Fragment key={dk}>
                        {newMonth && (
                          <div
                            className="border-y bg-muted/60 backdrop-blur-sm"
                            style={{ gridColumn: "1 / -1" }}
                          >
                            <span className="sticky left-0 inline-block px-2 py-1 text-xs font-semibold">
                              {fmtMonthYear(date)}
                            </span>
                          </div>
                        )}
                        <div
                          className={cn(
                            "sticky left-0 z-10 flex flex-col justify-start border-r border-b bg-muted p-2 text-xs",
                            isToday && "!bg-emerald-500/15",
                          )}
                        >
                          <span className="text-[10px] text-muted-foreground">
                            {fmtWeekday(date)}
                          </span>
                          <span className="text-sm leading-tight font-semibold">
                            {date.getDate()}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                            {date.toLocaleDateString([], { month: "short" })}{" "}
                            {date.getFullYear()} · W{isoWeek(date)}
                          </span>
                          {isToday && (
                            <span className="mt-0.5 text-[10px] font-medium text-emerald-400">
                              Today
                            </span>
                          )}
                        </div>
                        {lanes.map((l) => (
                          <Cell
                            key={l.key}
                            entries={cells.get(`${dk}|${l.key}`) ?? []}
                            mode={cellMode}
                            selected={selected}
                            onToggleSelect={toggleSelect}
                            onFocusIdea={setIdeaFocus}
                            onFocusSeries={setSeriesFocus}
                            dimOf={(es) => !!focus && !es.some(inFocus)}
                          />
                        ))}
                        {weekEnds && (
                          <StrategyRow
                            weekKey={wk}
                            lanes={lanes}
                            weekLane={weekLane}
                          />
                        )}
                      </Fragment>
                    );
                  })}

                  {/* Load older — extends the past window 3 months at a time. */}
                  {hasOlder && (
                    <div
                      className="border-t p-3"
                      style={{ gridColumn: "1 / -1" }}
                    >
                      <button
                        onClick={() => setPastMonths((p) => p + 3)}
                        className="sticky left-3 rounded-full border border-border px-4 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                      >
                        Load 3 more months back ↓
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </MetricsCtx.Provider>

        {/* Selection action bar */}
        {selected.size > 0 && (
          <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
            <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-2 shadow-lg">
              <span className="px-1 text-sm font-medium">
                {selected.size} selected
              </span>
              <span className="h-5 w-px bg-border" />
              <button
                onClick={() => setGroupOpen(true)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors hover:bg-accent"
              >
                <Layers className="size-4" /> Group
              </button>
              <button
                onClick={sendToLaunch}
                className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              >
                <Rocket className="size-4" /> Send to Launch
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Group dialog */}
        <SimpleDialog
          open={groupOpen}
          onOpenChange={setGroupOpen}
          title="Group into a content idea"
        >
          <p className="text-sm text-muted-foreground">
            {selected.size} post{selected.size === 1 ? "" : "s"} → one content
            idea on the board.
          </p>
          <label className="mt-3 block">
            <span className="text-xs text-muted-foreground">Title</span>
            <input
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="e.g. World Cup 2026 push"
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <div className="mt-3 flex gap-2">
            {(["single", "series"] as const).map((u) => (
              <button
                key={u}
                onClick={() => setGroupUnit(u)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                  groupUnit === u
                    ? "border-foreground/40 bg-accent"
                    : "border-border hover:bg-accent",
                )}
              >
                <span className="block text-sm font-medium capitalize">
                  {u}
                </span>
                <span className="text-muted-foreground">
                  {u === "single"
                    ? "One idea; these posts are its renderings"
                    : "A series; one idea per post"}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setGroupOpen(false)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              disabled={createGrouping.isPending}
              onClick={() =>
                createGrouping.mutate({
                  platformPostIds: [...selected],
                  title: groupTitle.trim() || undefined,
                  unit: groupUnit,
                })
              }
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {createGrouping.isPending ? "Grouping…" : "Create grouping"}
            </button>
          </div>
          {createGrouping.error && (
            <p className="mt-2 text-xs text-rose-400">
              {createGrouping.error.message}
            </p>
          )}
        </SimpleDialog>
        <PostDetailDialog
          entry={detail}
          ownedBrands={brands.filter((brand) => brand.role === "owned")}
          onOpenChange={(open) => !open && void setPostId(null)}
        />
      </div>
    </PostOpenCtx.Provider>
  );
}

// ---- pieces --------------------------------------------------------------

function LaneHeader({ lane }: { lane: Lane }) {
  return (
    <div
      className="sticky top-0 z-20 flex items-center gap-1.5 border-r border-b bg-muted px-2 py-2 text-xs font-medium [&:nth-last-child(1)]:border-r-0"
      style={
        lane.color ? { borderBottom: `2px solid ${lane.color}` } : undefined
      }
    >
      {lane.platform ? (
        <ChannelLogo platform={lane.platform} className="size-4 shrink-0" />
      ) : lane.logo ? (
        // oxlint-disable-next-line nextjs/no-img-element
        <img
          src={lane.logo}
          alt=""
          className="size-4 shrink-0 rounded object-cover"
        />
      ) : null}
      <span className="truncate">{lane.label}</span>
    </div>
  );
}

/** The week-boundary strategy row — one quiet subtotal per lane (count · format
 *  strip · dominant read · open slots). The "index" injected into the feed. */
function StrategyRow({
  weekKey,
  lanes,
  weekLane,
}: {
  weekKey: string;
  lanes: Lane[];
  weekLane: Map<string, V5Entry[]>;
}) {
  const monday = new Date(`${weekKey}T00:00:00`);
  return (
    <Fragment>
      <div className="sticky left-0 z-10 flex flex-col justify-center border-y-2 border-r bg-muted/40 p-2">
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Week
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          of {fmtDay(monday)}
        </span>
      </div>
      {lanes.map((l) => (
        <div
          key={l.key}
          className="border-y-2 border-r bg-muted/20 [&:nth-last-child(1)]:border-r-0"
        >
          <StrategyCell entries={weekLane.get(`${weekKey}|${l.key}`) ?? []} />
        </div>
      ))}
    </Fragment>
  );
}

/** A lane's week subtotal: count, a √-scaled dot per format family, the
 *  dominant read (muted until ≥6 posts), and any open slots. */
function StrategyCell({ entries }: { entries: V5Entry[] }) {
  const metrics = useContext(MetricsCtx);
  const posts = entries.filter((e) => e.status !== "slot");
  const open = entries.length - posts.length;
  const total = posts.length;
  const counts = STRAT_FAMILIES.map(() => 0);
  for (const e of posts) {
    const fam = FAMILY_OF[e.archetype ?? ""] ?? "text";
    const idx = STRAT_FAMILIES.findIndex((f) => f.id === fam);
    if (idx >= 0) counts[idx]!++;
  }
  const top = counts.reduce((b, n, i) => (n > b.n ? { n, i } : b), {
    n: 0,
    i: -1,
  });
  const read = !total
    ? null
    : top.n / total >= 0.5
      ? `${STRAT_FAMILIES[top.i]!.label}-led`
      : "Mixed";
  const confident = total >= 6;
  // Performance read: total reach + the week's best post for this lane.
  const totalEng = posts.reduce((s, e) => s + engagementOf(e), 0);
  const best =
    total > 0
      ? posts.reduce((b, e) => (engagementOf(e) > engagementOf(b) ? e : b))
      : null;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {total || "—"}
      </span>
      {metrics && total > 0 && (
        <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
          <span className="font-medium text-emerald-400 tabular-nums">
            {fmtNum(totalEng)}
          </span>
          {best && engagementLabel(best) && (
            <span className="truncate text-muted-foreground">
              · top {engagementLabel(best)}
            </span>
          )}
        </span>
      )}
      {!metrics && total > 0 && (
        <span className="flex shrink-0 items-center gap-1.5">
          {STRAT_FAMILIES.map((f, i) =>
            counts[i] === 0 ? (
              <span
                key={f.id}
                className="size-[3px] rounded-full bg-muted-foreground/25"
              />
            ) : (
              <span
                key={f.id}
                title={`${f.label} · ${counts[i]}`}
                className="rounded-full bg-emerald-500"
                style={{
                  width: 5 + Math.sqrt(counts[i]!) * 4,
                  height: 5 + Math.sqrt(counts[i]!) * 4,
                }}
              />
            ),
          )}
        </span>
      )}
      {!metrics && read && (
        <span
          className={cn(
            "truncate text-[11px]",
            confident
              ? "font-medium text-emerald-400"
              : "text-muted-foreground",
          )}
        >
          {read}
          {!confident ? ` · ${top.n} of ${total}` : ""}
        </span>
      )}
      {open > 0 && (
        <span className="ml-auto shrink-0 rounded-full border border-dashed border-border px-1.5 text-[10px] font-medium text-muted-foreground">
          {open} open
        </span>
      )}
    </div>
  );
}

/** Spots grouped by channel within a day (canonical channel order). */
function channelGroups(
  entries: V5Entry[],
): { platform: string; entries: V5Entry[] }[] {
  const m = new Map<string, V5Entry[]>();
  for (const e of entries)
    (m.get(e.platform) ?? m.set(e.platform, []).get(e.platform)!).push(e);
  return [...m.entries()]
    .sort((a, b) => channelRank(a[0]) - channelRank(b[0]))
    .map(([platform, es]) => ({ platform, entries: es }));
}

/** One day×lane cell. Two in-cell groupings, both laid out 2-up:
 *  - "content": idea trays (2+ spots span the full width) + single cards;
 *  - "channel": tiny channel sub-headers, each with its cards.
 *  The lens dims any block whose entries aren't in focus. */
function Cell({
  entries,
  mode,
  selected,
  onToggleSelect,
  onFocusIdea,
  onFocusSeries,
  dimOf,
}: {
  entries: V5Entry[];
  mode: "content" | "channel";
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onFocusIdea: (key: string, label: string) => void;
  onFocusSeries: (key: string, label: string) => void;
  dimOf: (entries: V5Entry[]) => boolean;
}) {
  const metrics = useContext(MetricsCtx);
  // In Performance mode, surface winners by sorting on peak engagement.
  const maxEng = (es: V5Entry[]) =>
    es.reduce((m, e) => Math.max(m, engagementOf(e)), 0);
  const groups = groupEntries(entries);
  if (metrics) groups.sort((a, b) => maxEng(b.entries) - maxEng(a.entries));
  return (
    <div className="flex min-h-14 flex-col gap-2 border-r border-b p-1.5 [&:nth-last-child(1)]:border-r-0">
      {mode === "content" ? (
        <div className="grid grid-cols-2 gap-1.5">
          {groups.map((g) =>
            g.entries.length >= 2 ? (
              <div
                key={g.key}
                className={cn(
                  "col-span-2 transition-opacity",
                  dimOf(g.entries) && "opacity-20",
                )}
              >
                <IdeaTray
                  group={g}
                  selected={selected}
                  onToggleSelect={onToggleSelect}
                  onFocusIdea={onFocusIdea}
                  onFocusSeries={onFocusSeries}
                />
              </div>
            ) : (
              <div
                key={g.key}
                className={cn(
                  "transition-opacity",
                  dimOf(g.entries) && "opacity-20",
                )}
              >
                <SpotCard
                  entry={g.entries[0]!}
                  selected={selected.has(g.entries[0]!.id)}
                  onToggle={() => onToggleSelect(g.entries[0]!.id)}
                  onFocusSeries={onFocusSeries}
                />
              </div>
            ),
          )}
        </div>
      ) : (
        channelGroups(entries).map((cg) => (
          <div key={cg.platform} className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <ChannelLogo platform={cg.platform} className="size-3" />
              {platformLabel(cg.platform)} · {cg.entries.length}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(metrics
                ? [...cg.entries].sort(
                    (a, b) => engagementOf(b) - engagementOf(a),
                  )
                : cg.entries
              ).map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    "transition-opacity",
                    dimOf([e]) && "opacity-20",
                  )}
                >
                  <SpotCard
                    entry={e}
                    selected={selected.has(e.id)}
                    onToggle={() => onToggleSelect(e.id)}
                    onFocusSeries={onFocusSeries}
                  />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** A content idea and its renderings — the title is stated ONCE in the header,
 *  the spots differentiate by channel (canonical order). */
function IdeaTray({
  group,
  selected,
  onToggleSelect,
  onFocusIdea,
  onFocusSeries,
}: {
  group: Group;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onFocusIdea: (key: string, label: string) => void;
  onFocusSeries: (key: string, label: string) => void;
}) {
  const first = group.entries[0]!;
  const pillar = first.pillar ? PILLAR_BY_SLUG[first.pillar] : null;
  const title = first.title ?? first.text ?? "Untitled idea";
  const spots = [...group.entries].sort(
    (a, b) =>
      channelRank(a.platform) - channelRank(b.platform) ||
      new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const formats = [
    ...new Set(
      group.entries
        .map((e) => postTypeLabel(e.format, e.archetype))
        .filter((x): x is string => !!x),
    ),
  ];
  return (
    <div
      className="rounded-md border bg-card/50"
      style={pillar ? { borderLeft: `2px solid ${pillar.color}` } : undefined}
    >
      <button
        onClick={() =>
          first.contentPostId && onFocusIdea(first.contentPostId, title)
        }
        title="Focus this idea across the board"
        className="flex w-full items-start px-1.5 pt-1.5 text-left hover:text-foreground/80"
      >
        <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-tight font-medium break-words">
          {title}
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-1 px-1.5 pt-1 pb-1">
        {first.seriesName && (
          <SeriesChip
            name={first.seriesName}
            color={first.seriesColor}
            onClick={() => onFocusSeries(first.seriesName!, first.seriesName!)}
          />
        )}
        {formats.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {formats.join(" · ")}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground/60 tabular-nums">
          {group.entries.length} spots
        </span>
      </div>
      <div className="flex flex-wrap gap-1 p-1.5 pt-0">
        {spots.map((e) => (
          <SpotThumb
            key={e.id}
            entry={e}
            selected={selected.has(e.id)}
            onToggle={() => onToggleSelect(e.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** A single rendering — a 56px thumbnail with its channel + repost state. */
function SpotThumb({
  entry,
  selected,
  onToggle,
}: {
  entry: V5Entry;
  selected: boolean;
  onToggle: () => void;
}) {
  const repost = isRepost(entry);
  const openPost = useContext(PostOpenCtx);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openPost(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPost(entry);
        }
      }}
      title={entry.text ?? platformLabel(entry.platform)}
      className={cn(
        "group relative size-14 cursor-pointer overflow-hidden rounded",
        selected
          ? "ring-2 ring-emerald-500"
          : "hover:ring-1 hover:ring-foreground/30",
        repost && "opacity-50",
      )}
    >
      <Poster
        src={entry.mediaUrl}
        platform={entry.platform}
        archetype={entry.archetype}
        className="size-full"
      />
      <button
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        title={selected ? "Remove from selection" : "Select post"}
        className={cn(
          "absolute top-0.5 left-0.5 flex size-4 items-center justify-center rounded border backdrop-blur-sm",
          selected
            ? "border-emerald-400 bg-emerald-600 text-white"
            : "border-white/30 bg-black/45 text-white opacity-0 group-hover:opacity-100",
        )}
      >
        {selected && <Check className="size-2.5" />}
      </button>
      <span className="absolute bottom-0.5 left-0.5 rounded bg-black/45 p-0.5 backdrop-blur-sm">
        <ChannelLogo platform={entry.platform} className="size-3" />
      </span>
      {repost && (
        <span className="absolute top-0.5 right-0.5 rounded bg-violet-600/85 px-1 text-[8px] font-medium text-white">
          ↻
        </span>
      )}
      {entry.externalUrl && (
        <a
          href={entry.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open original"
          className="absolute right-0.5 bottom-0.5 flex size-4 items-center justify-center rounded bg-card/80 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:text-foreground"
        >
          <ExternalLink className="size-2.5" />
        </a>
      )}
    </div>
  );
}

/** A standalone / single-channel post (or scraped peer post with no idea).
 *  Vertical banner card — sits 2-up in the cell grid. */
function SpotCard({
  entry,
  selected,
  onToggle,
  onFocusSeries,
}: {
  entry: V5Entry;
  selected: boolean;
  onToggle: () => void;
  onFocusSeries: (key: string, label: string) => void;
}) {
  const pillar = entry.pillar ? PILLAR_BY_SLUG[entry.pillar] : null;
  const label = entry.title ?? entry.text ?? platformLabel(entry.platform);
  const typeLabel = postTypeLabel(entry.format, entry.archetype);
  const repost = isRepost(entry);
  const metrics = useContext(MetricsCtx);
  const openPost = useContext(PostOpenCtx);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openPost(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPost(entry);
        }
      }}
      title={label}
      className={cn(
        "group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-md border bg-card text-left text-xs transition-colors",
        selected ? "ring-2 ring-emerald-500" : "hover:border-foreground/30",
        repost && "opacity-60",
      )}
      style={pillar ? { borderLeft: `2px solid ${pillar.color}` } : undefined}
    >
      <Poster
        src={entry.mediaUrl}
        platform={entry.platform}
        archetype={entry.archetype}
        className="h-20 w-full"
      />
      <button
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        title={selected ? "Remove from selection" : "Select post"}
        className={cn(
          "absolute top-1 right-1 z-10 flex size-5 items-center justify-center rounded border backdrop-blur-sm",
          selected
            ? "border-emerald-400 bg-emerald-600 text-white"
            : "border-white/30 bg-black/45 text-white opacity-0 group-hover:opacity-100",
        )}
      >
        {selected && <Check className="size-3" />}
      </button>
      {typeLabel && (
        <span className="absolute top-1 left-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
          {typeLabel}
        </span>
      )}
      {repost && (
        <span className="absolute top-1 right-7 rounded bg-violet-600/85 px-1 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
          ↻
        </span>
      )}
      {entry.externalUrl && (
        <a
          href={entry.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open original"
          className="absolute right-1 bottom-[3.25rem] flex size-5 items-center justify-center rounded border bg-card/80 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:text-foreground"
        >
          <ExternalLink className="size-3" />
        </a>
      )}
      <div className="flex flex-1 flex-col gap-1 p-1.5">
        <span className="line-clamp-2 leading-tight break-words">{label}</span>
        <span className="mt-auto flex flex-wrap items-center gap-1">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              STATUS_DOT[entry.status] ?? "bg-slate-400",
            )}
          />
          <ChannelLogo platform={entry.platform} className="size-3" />
          {entry.seriesName && (
            <SeriesChip
              name={entry.seriesName}
              color={entry.seriesColor}
              onClick={() =>
                onFocusSeries(entry.seriesName!, entry.seriesName!)
              }
            />
          )}
          {metrics && (
            <span className="ml-auto shrink-0">
              <EngagementChip e={entry} />
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/** A series franchise — stable color, clickable to focus its whole run. */
function SeriesChip({
  name,
  color,
  onClick,
}: {
  name: string;
  color: string | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`Focus series: ${name}`}
      className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium hover:bg-accent"
      style={color ? { borderColor: color } : undefined}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: color ?? "var(--color-emerald-500)" }}
      />
      <span className="max-w-[8rem] truncate">{name}</span>
    </button>
  );
}

/** Post thumbnail with a graceful fallback: scraped IG/peer media lives on
 *  signed CDN URLs (scontent.cdninstagram.com) that EXPIRE, so a once-valid
 *  thumbnail 404s later. On error, fall back to the platform logo rather than
 *  a broken-image icon. (Durable fix = re-host to Blob at scrape time.) */
function Poster({
  src,
  platform,
  archetype,
  className,
}: {
  src: string | null;
  platform: string;
  archetype?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  if (showImg) {
    return (
      <span
        className={cn(
          "relative shrink-0 overflow-hidden bg-muted",
          className ?? "size-8 rounded",
        )}
      >
        {/* oxlint-disable-next-line nextjs/no-img-element */}
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      </span>
    );
  }
  // No usable media (text post, or an expired/blocked CDN URL) — render a typed
  // placeholder: the format glyph + channel logo, so it reads as intentional.
  const Glyph = (archetype && ARCHETYPE_ICON[archetype]) || null;
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-muted to-muted/30 text-muted-foreground/40",
        className ?? "size-8 rounded",
      )}
    >
      {Glyph ? (
        <Glyph className="size-6" strokeWidth={1.5} />
      ) : (
        <ChannelLogo platform={platform} className="size-5 opacity-50" />
      )}
      <span className="absolute right-0.5 bottom-0.5 opacity-50">
        <ChannelLogo platform={platform} className="size-3" />
      </span>
    </span>
  );
}

/** Compact pill dropdown for a single-select filter (status / channel / type). */
function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  const active = value !== "all";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs capitalize transition-colors",
        active
          ? "border-foreground/30 bg-accent text-foreground"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      <option value="all">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Engagement read for Performance mode — shows every present metric (likes,
 *  comments, views) so view-heavy owned posts don't hide their likes/comments. */
function EngagementChip({ e }: { e: V5Entry }) {
  const parts: [LucideIcon, number][] = [];
  if (e.likes > 0) parts.push([Heart, e.likes]);
  if (e.comments > 0) parts.push([MessageCircle, e.comments]);
  if (e.views > 0) parts.push([Eye, e.views]);
  if (!parts.length) return null;
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 tabular-nums">
      {parts.map(([Icon, n], i) => (
        <span key={i} className="flex items-center gap-0.5">
          <Icon className="size-2.5" /> {fmtNum(n)}
        </span>
      ))}
    </span>
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
    <div className="flex overflow-hidden rounded-full border border-border">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
