"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import { ProduceDrawer } from "@/app/app/studio/ProduceDrawer";
import { GenerateSlotsDialog } from "@/app/app/content/GenerateSlotsDialog";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { SimpleDialog } from "@/components/ui/dialog";
import { SimpleSelect } from "@/components/ui/select";
import {
  AssigneeButton,
  useSelfAssignHotkey,
  type Member,
} from "@/components/assignment/assignee";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/components/ui/lib/utils";
import { PILLAR_BY_SLUG, PILLARS } from "@/lib/pillars";
import { keyDatesForYear } from "@/lib/key-dates";
import { useFullBleed } from "@/lib/use-full-bleed";

export type CalEntry = {
  id: string;
  brandId: string;
  brandName: string;
  tracked?: boolean; // a competitor/inspiration brand we scrape, not our own
  platform: string;
  contentPostId: string | null;
  title: string | null;
  pillar: string | null;
  seriesName: string | null;
  seriesColor: string | null;
  text: string | null;
  status: string;
  isSeed: boolean;
  externalUrl: string | null;
  mediaUrl: string | null;
  handle: string | null;
  at: string; // ISO — effective day (published ?? scheduled ?? planned ?? created)
  ideaOwner: Member | null; // content_post owner (the piece's DRI)
  spotOwner: Member | null; // platform_post owner (this channel spot)
};

// Assignment wiring threaded into the day dialog (the calendar's assign surface).
export type CalAssign = {
  members: Member[];
  currentUserId: string;
  ideaOwnerOf: (e: CalEntry) => Member | null;
  spotOwnerOf: (e: CalEntry) => Member | null;
  assignIdea: (contentPostId: string, ownerId: string | null) => void;
  assignSpot: (platformPostId: string, ownerId: string | null) => void;
};

// ---- date helpers (local-time, to avoid UTC off-by-one) ------------------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Monday=0 … Sunday=6 (week starts Monday). */
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Weeks (Mon-start) covering a month, trailing empty week trimmed. */
function monthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = addDays(first, -mondayIndex(first));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((mondayIndex(first) + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
  );
}

/** Columns of 7 (Mon-start) covering the whole year — the heatmap grid. */
function yearColumns(year: number): Date[][] {
  const first = new Date(year, 0, 1);
  const start = addDays(first, -mondayIndex(first));
  const last = new Date(year, 11, 31);
  const end = addDays(last, 6 - mondayIndex(last));
  const cols: Date[][] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 7 * DAY) {
    const col0 = new Date(t);
    cols.push(Array.from({ length: 7 }, (_, d) => addDays(col0, d)));
  }
  return cols;
}

// ---- density / status palettes ------------------------------------------

/** Absolute buckets → 0..4. Tuned for a multi-brand content cadence. */
function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}
const HEAT_BG = [
  "bg-muted/40",
  "bg-emerald-500/25",
  "bg-emerald-500/45",
  "bg-emerald-500/70",
  "bg-emerald-500/95",
];
/** Mini-month tint opacity per level (pillar-colored, set via inline style). */
const PILLAR_OPACITY = [0, 0.18, 0.4, 0.65, 0.9];

const STATUS_DOT: Record<string, string> = {
  published: "bg-emerald-500",
  scheduled: "bg-sky-500",
  approved: "bg-amber-500",
  pending_review: "bg-amber-500",
  draft: "bg-slate-400",
  discovered: "bg-violet-400",
  rejected: "bg-rose-500",
  archived: "bg-muted-foreground",
};

// ---- content grouping (one chip per parent content piece) ----------------

type DayGroup = {
  key: string;
  contentPostId: string | null;
  title: string | null;
  pillarSlug: string | null;
  entries: CalEntry[];
};

function groupDay(entries: CalEntry[]): DayGroup[] {
  const byKey = new Map<string, DayGroup>();
  for (const e of entries) {
    const key = e.contentPostId ?? `solo:${e.id}`;
    const g = byKey.get(key);
    if (g) g.entries.push(e);
    else
      byKey.set(key, {
        key,
        contentPostId: e.contentPostId,
        title: e.title,
        pillarSlug: e.pillar,
        entries: [e],
      });
  }
  return [...byKey.values()];
}

/** Most common pillar among a day's entries (drives mini-month tint). */
function dominantPillar(entries: CalEntry[]): string | null {
  const counts = new Map<string, number>();
  for (const e of entries) if (e.pillar) counts.set(e.pillar, (counts.get(e.pillar) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// ==========================================================================

type Zoom = "month" | "year";
type YearMode = "months" | "detailed" | "heatmap";

export function CalendarClient({
  entries,
  brands,
  ownedBrands,
  members,
  currentUserId,
  nowISO,
  initial,
}: {
  entries: CalEntry[];
  brands: { id: string; name: string; slug: string | null }[];
  // Owned brands only (flagship first) — the Generate-slots target list.
  ownedBrands: { id: string; name: string }[];
  members: Member[];
  currentUserId: string;
  nowISO: string;
  initial?: {
    brandId?: string;
    pillar?: string;
    year?: number;
    month?: number;
  };
}) {
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const todayKey = keyOf(now);
  const router = useRouter();
  const trpc = useTRPC();

  // Default to the Year · Detailed view; a Studio-wheel deep-link that targets a
  // specific month still opens the focused Month zoom.
  const [zoom, setZoom] = useState<Zoom>(initial?.month != null ? "month" : "year");
  const [yearMode, setYearMode] = useState<YearMode>("detailed");
  const [year, setYear] = useState(initial?.year ?? now.getFullYear());
  const [month, setMonth] = useState(initial?.month ?? now.getMonth());
  const [brandFilter, setBrandFilter] = useState(initial?.brandId ?? "all");
  const [pillarFilter, setPillarFilter] = useState(initial?.pillar ?? "all");
  const [mineOnly, setMineOnly] = useState(false);
  const [dayDetail, setDayDetail] = useState<{ key: string; date: Date } | null>(null);
  const [produceDate, setProduceDate] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  // Per-month CTAs: "Generate" pre-targets the dialog; "Evaluate" opens the report.
  const [generateMonth, setGenerateMonth] = useState<string | null>(null);
  const [reportMonth, setReportMonth] = useState<{ year: number; month: number } | null>(
    null,
  );
  const openGenerateFor = (y: number, mo: number) => {
    setGenerateMonth(`${y}-${String(mo + 1).padStart(2, "0")}`);
    setGenerateOpen(true);
  };

  const { ref, style } = useFullBleed();

  // Optimistic owner overrides (idea keyed by contentPostId, spot by entry id).
  const [ideaOverrides, setIdeaOverrides] = useState<Record<string, Member | null>>({});
  const [spotOverrides, setSpotOverrides] = useState<Record<string, Member | null>>({});
  const setOwner = useMutation(
    trpc.content.setOwner.mutationOptions({ onSettled: () => router.refresh() }),
  );
  const setSpotOwner = useMutation(
    trpc.content.setSpotOwner.mutationOptions({ onSettled: () => router.refresh() }),
  );
  const memberById = (id: string | null) =>
    id ? (members.find((m) => m.id === id) ?? null) : null;
  const assign: CalAssign = useMemo(
    () => ({
      members,
      currentUserId,
      ideaOwnerOf: (e) =>
        e.contentPostId && e.contentPostId in ideaOverrides
          ? ideaOverrides[e.contentPostId]!
          : e.ideaOwner,
      spotOwnerOf: (e) => (e.id in spotOverrides ? spotOverrides[e.id]! : e.spotOwner),
      assignIdea: (contentPostId, ownerId) => {
        setIdeaOverrides((p) => ({ ...p, [contentPostId]: memberById(ownerId) }));
        setOwner.mutate({ contentPostId, ownerId });
      },
      assignSpot: (platformPostId, ownerId) => {
        setSpotOverrides((p) => ({ ...p, [platformPostId]: memberById(ownerId) }));
        setSpotOwner.mutate({ platformPostId, ownerId });
      },
    }),
    // memberById is derived from members; overrides drive re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, currentUserId, ideaOverrides, spotOverrides, setOwner, setSpotOwner],
  );

  const selectedBrand = brands.find((b) => b.id === brandFilter) ?? null;
  // Producing needs a concrete brand; fall back to the first when "all brands".
  const produceBrand = selectedBrand ?? brands[0] ?? null;
  // Pillars relevant to the current brand filter (all when "all brands").
  const pillars = useMemo(
    () =>
      selectedBrand
        ? PILLARS.filter((p) => p.brandSlug === selectedBrand.slug)
        : PILLARS,
    [selectedBrand],
  );

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (brandFilter !== "all" && e.brandId !== brandFilter) return false;
        if (pillarFilter !== "all" && e.pillar !== pillarFilter) return false;
        if (
          mineOnly &&
          assign.ideaOwnerOf(e)?.id !== currentUserId &&
          assign.spotOwnerOf(e)?.id !== currentUserId
        )
          return false;
        return true;
      }),
    [entries, brandFilter, pillarFilter, mineOnly, assign, currentUserId],
  );

  // Day-keyed index — the single source both views read from.
  const byDay = useMemo(() => {
    const m = new Map<string, CalEntry[]>();
    for (const e of filtered) {
      const k = keyOf(new Date(e.at));
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return m;
  }, [filtered]);

  const keyDates = useMemo(() => {
    const m = new Map<string, { emoji: string; name: string }>();
    // The rolling window can span two calendar years.
    for (const y of [year, year + 1]) {
      for (const { keyDate, date } of keyDatesForYear(y)) {
        m.set(keyOf(date), { emoji: keyDate.emoji, name: keyDate.name });
      }
    }
    return m;
  }, [year]);

  // Year zoom = a rolling 12-month window anchored at (year, month): opens on
  // the current month, steps backwards for history. Heatmap stays a calendar
  // year (its grid is year-shaped).
  const windowMonths = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const d = new Date(year, month + i, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
      }),
    [year, month],
  );
  const windowEnd = windowMonths[11]!;
  const windowLabel = `${MONTHS_SHORT[month]} ${year} – ${MONTHS_SHORT[windowEnd.month]} ${windowEnd.year}`;

  const openMonth = (y: number, mo: number) => {
    setYear(y);
    setMonth(mo);
    setZoom("month");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {zoom === "month"
              ? `${MONTHS[month]} ${year}`
              : `${yearMode === "heatmap" ? year : windowLabel} · ${filtered.length} posts`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SimpleSelect
            value={brandFilter}
            onValueChange={(v) => {
              setBrandFilter(v);
              setPillarFilter("all");
            }}
            options={[
              { value: "all", label: "All brands" },
              ...brands.map((b) => ({ value: b.id, label: b.name })),
            ]}
            size="sm"
            aria-label="Brand"
          />
          <SimpleSelect
            value={pillarFilter}
            onValueChange={setPillarFilter}
            options={[
              { value: "all", label: "All pillars" },
              ...pillars.map((p) => ({ value: p.slug, label: p.name })),
            ]}
            size="sm"
            aria-label="Pillar"
          />

          <button
            onClick={() => setMineOnly((v) => !v)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              mineOnly
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            Mine
          </button>

          <button
            onClick={() => {
              setGenerateMonth(null);
              setGenerateOpen(true);
            }}
            className="border-border text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
          >
            <CalendarPlus className="size-3.5" /> Generate slots
          </button>

          <span className="bg-border mx-1 h-5 w-px" />

          <Segmented
            value={zoom}
            onChange={(v) => setZoom(v)}
            options={[
              { value: "month", label: "Month" },
              { value: "year", label: "Year" },
            ]}
          />
        </div>
      </div>

      {/* Sub-controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-b pb-4">
        {zoom === "month" ? (
          <>
            <NavStepper
              onPrev={() =>
                month === 0 ? (setYear(year - 1), setMonth(11)) : setMonth(month - 1)
              }
              onNext={() =>
                month === 11 ? (setYear(year + 1), setMonth(0)) : setMonth(month + 1)
              }
              label={`${MONTHS[month]} ${year}`}
            />
            <button
              onClick={() => {
                setYear(now.getFullYear());
                setMonth(now.getMonth());
              }}
              className="border-border text-muted-foreground hover:bg-accent rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            >
              Today
            </button>
          </>
        ) : (
          <>
            <NavStepper
              onPrev={() =>
                yearMode === "heatmap"
                  ? setYear(year - 1)
                  : month === 0
                    ? (setYear(year - 1), setMonth(11))
                    : setMonth(month - 1)
              }
              onNext={() =>
                yearMode === "heatmap"
                  ? setYear(year + 1)
                  : month === 11
                    ? (setYear(year + 1), setMonth(0))
                    : setMonth(month + 1)
              }
              label={yearMode === "heatmap" ? String(year) : windowLabel}
            />
            <button
              onClick={() => {
                setYear(now.getFullYear());
                setMonth(now.getMonth());
              }}
              className="border-border text-muted-foreground hover:bg-accent rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            >
              Today
            </button>
            <span className="bg-border mx-1 h-4 w-px" />
            <Segmented
              value={yearMode}
              onChange={(v) => setYearMode(v)}
              options={[
                { value: "months", label: "Months" },
                { value: "detailed", label: "Detailed" },
                { value: "heatmap", label: "Heatmap" },
              ]}
            />
          </>
        )}
        <span className="flex-1" />
        <Legend mode={zoom === "year" && yearMode === "heatmap" ? "heat" : "status"} />
      </div>

      {/* Body */}
      <div ref={ref} style={style} className="mt-5 px-8 sm:px-0">
        {zoom === "month" ? (
          <MonthGrid
            year={year}
            month={month}
            byDay={byDay}
            todayKey={todayKey}
            onDayClick={(date) => setDayDetail({ key: keyOf(date), date })}
          />
        ) : yearMode === "months" ? (
          <YearMonths
            months={windowMonths}
            byDay={byDay}
            keyDates={keyDates}
            todayKey={todayKey}
            onMonthClick={openMonth}
            onEvaluate={(y, mo) => setReportMonth({ year: y, month: mo })}
            onGenerate={openGenerateFor}
          />
        ) : yearMode === "detailed" ? (
          <YearMonthsDetailed
            months={windowMonths}
            byDay={byDay}
            todayKey={todayKey}
            onDayClick={(date) => setDayDetail({ key: keyOf(date), date })}
            onMonthClick={openMonth}
            onEvaluate={(y, mo) => setReportMonth({ year: y, month: mo })}
            onGenerate={openGenerateFor}
          />
        ) : (
          <Heatmap year={year} byDay={byDay} todayKey={todayKey} onDayClick={(d) => openMonth(d.getFullYear(), d.getMonth())} />
        )}
      </div>

      <DayDetailDialog
        date={dayDetail?.date ?? null}
        entries={dayDetail ? (byDay.get(dayDetail.key) ?? []) : []}
        assign={assign}
        onClose={() => setDayDetail(null)}
        onProduce={(date) => {
          setDayDetail(null);
          setProduceDate(date.toISOString());
        }}
      />

      <GenerateSlotsDialog
        brands={ownedBrands}
        defaultBrandId={
          brandFilter !== "all" && ownedBrands.some((b) => b.id === brandFilter)
            ? brandFilter
            : (ownedBrands[0]?.id ?? null)
        }
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={() => router.refresh()}
        initialMonth={generateMonth ?? undefined}
      />

      <MonthReportDialog
        target={reportMonth}
        entries={filtered}
        onClose={() => setReportMonth(null)}
        onGenerate={(y, mo) => {
          setReportMonth(null);
          openGenerateFor(y, mo);
        }}
        onOpenMonth={(y, mo) => {
          setReportMonth(null);
          openMonth(y, mo);
        }}
      />

      {produceDate && produceBrand && (
        <ProduceDrawer
          brandId={produceBrand.id}
          brandSlug={produceBrand.slug}
          pillarSlug={pillarFilter !== "all" ? pillarFilter : undefined}
          date={produceDate}
          open={!!produceDate}
          onClose={() => setProduceDate(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

// ---- Month grid (shared by the Month zoom and the Year · Detailed view) ----

/** One full-fidelity month calendar — media-thumbnail chips, 3 per day. Used at
 * full width by the Month zoom and 2-up (with a header) by the Year · Detailed
 * grid, so both views render identically. */
function MonthGrid({
  year,
  month,
  byDay,
  todayKey,
  onDayClick,
  header,
}: {
  year: number;
  month: number;
  byDay: Map<string, CalEntry[]>;
  todayKey: string;
  onDayClick: (date: Date) => void;
  // When present, renders a clickable month-name bar with the post total —
  // used by the Year · Detailed grid; the Month zoom omits it.
  header?: {
    name: string;
    total: number;
    onMonthClick: () => void;
    onEvaluate?: () => void;
    onGenerate?: () => void;
  };
}) {
  const weeks = useMemo(() => monthWeeks(year, month), [year, month]);

  return (
    <div className="overflow-hidden rounded-xl border">
      {header && (
        <div className="bg-muted/30 flex items-center gap-2 border-b px-2.5 py-1.5">
          <button
            onClick={header.onMonthClick}
            className="text-sm font-semibold hover:underline"
          >
            {header.name}
          </button>
          <span className="flex-1" />
          {header.total > 0 && (
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {header.total}
            </span>
          )}
          {header.onEvaluate && (
            <button
              onClick={header.onEvaluate}
              className="border-border text-muted-foreground hover:bg-accent hover:text-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors"
            >
              Evaluate
            </button>
          )}
          {header.onGenerate && (
            <button
              onClick={header.onGenerate}
              className="rounded-full border border-emerald-600/50 px-2 py-0.5 text-[10px] font-medium text-emerald-400 transition-colors hover:bg-emerald-600/15"
            >
              Generate
            </button>
          )}
        </div>
      )}
      <div className="text-muted-foreground bg-muted/30 grid grid-cols-7 border-b text-[11px] font-medium">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-1.5">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((date) => {
          const k = keyOf(date);
          const inMonth = date.getMonth() === month;
          const isToday = k === todayKey;
          const groups = groupDay(byDay.get(k) ?? []);
          const shown = groups.slice(0, 3);
          const extra = groups.length - shown.length;
          return (
            <button
              key={k}
              onClick={() => onDayClick(date)}
              className={cn(
                "group hover:bg-accent/30 flex min-h-28 flex-col gap-1 border-b border-r p-1.5 text-left transition-colors [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-muted/20 opacity-50",
              )}
            >
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                    isToday
                      ? "bg-foreground text-background font-semibold"
                      : "text-muted-foreground",
                  )}
                >
                  {date.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {shown.map((g) => (
                  <ContentChip key={g.key} g={g} />
                ))}
                {extra > 0 && (
                  <span className="text-muted-foreground px-1 text-[10px]">
                    +{extra} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ContentChip({ g }: { g: DayGroup }) {
  const pillar = g.pillarSlug ? PILLAR_BY_SLUG[g.pillarSlug] : null;
  const status = g.entries[0]?.status ?? "draft";
  const platform = g.entries[0]?.platform ?? "";
  const media = g.entries.find((e) => e.mediaUrl)?.mediaUrl ?? null;
  const label =
    g.title ?? g.entries[0]?.text ?? platformLabel(platform);
  return (
    <span
      className="bg-card flex items-center gap-1.5 overflow-hidden rounded-md border p-1 text-xs"
      style={pillar ? { borderLeft: `2px solid ${pillar.color}` } : undefined}
      title={label}
    >
      <span className="bg-muted relative size-8 shrink-0 overflow-hidden rounded">
        {media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-muted-foreground flex size-full items-center justify-center">
            <ChannelLogo platform={platform} className="size-4" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate leading-tight">{label}</span>
        <span className="flex items-center gap-1 leading-none">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              STATUS_DOT[status] ?? "bg-slate-400",
            )}
          />
          <span className="text-muted-foreground truncate text-[10px] capitalize">
            {status}
          </span>
          {g.entries.length > 1 && (
            <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
              ×{g.entries.length}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

// ---- Year · Months (mini calendars, pillar-tinted) ------------------------

function YearMonths({
  months,
  byDay,
  keyDates,
  todayKey,
  onMonthClick,
  onEvaluate,
  onGenerate,
}: {
  months: { year: number; month: number }[];
  byDay: Map<string, CalEntry[]>;
  keyDates: Map<string, { emoji: string; name: string }>;
  todayKey: string;
  onMonthClick: (year: number, month: number) => void;
  onEvaluate: (year: number, month: number) => void;
  onGenerate: (year: number, month: number) => void;
}) {
  const firstYear = months[0]?.year;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {months.map(({ year, month }) => (
        <MiniMonth
          key={`${year}-${month}`}
          name={year === firstYear ? MONTHS[month]! : `${MONTHS[month]} ${year}`}
          year={year}
          month={month}
          byDay={byDay}
          keyDates={keyDates}
          todayKey={todayKey}
          onClick={() => onMonthClick(year, month)}
          onEvaluate={() => onEvaluate(year, month)}
          onGenerate={() => onGenerate(year, month)}
        />
      ))}
    </div>
  );
}

function MiniMonth({
  name,
  year,
  month,
  byDay,
  keyDates,
  todayKey,
  onClick,
  onEvaluate,
  onGenerate,
}: {
  name: string;
  year: number;
  month: number;
  byDay: Map<string, CalEntry[]>;
  keyDates: Map<string, { emoji: string; name: string }>;
  todayKey: string;
  onClick: () => void;
  onEvaluate: () => void;
  onGenerate: () => void;
}) {
  const weeks = useMemo(() => monthWeeks(year, month), [year, month]);
  const total = useMemo(() => {
    let n = 0;
    for (const week of weeks)
      for (const d of week)
        if (d.getMonth() === month) n += byDay.get(keyOf(d))?.length ?? 0;
    return n;
  }, [weeks, month, byDay]);

  return (
    // div-with-role (not <button>) so the hover CTAs can be real buttons.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className="hover:border-foreground/30 group cursor-pointer rounded-lg border p-2.5 text-left transition-colors"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-sm font-semibold group-hover:underline">{name}</span>
        <span className="flex-1" />
        <span
          className="hidden items-center gap-1 group-focus-within:flex group-hover:flex"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onEvaluate}
            className="border-border text-muted-foreground hover:bg-accent hover:text-foreground rounded-full border px-1.5 py-0.5 text-[9px] font-medium"
          >
            Evaluate
          </button>
          <button
            onClick={onGenerate}
            className="rounded-full border border-emerald-600/50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400 hover:bg-emerald-600/15"
          >
            Generate
          </button>
        </span>
        {total > 0 && (
          <span className="text-muted-foreground text-[11px] tabular-nums group-hover:hidden">
            {total}
          </span>
        )}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-muted-foreground text-center text-[9px]">
            {w[0]}
          </span>
        ))}
        {weeks.flat().map((d) => {
          const k = keyOf(d);
          const inMonth = d.getMonth() === month;
          const dayEntries = byDay.get(k) ?? [];
          const lv = level(dayEntries.length);
          const pillarSlug = dominantPillar(dayEntries);
          const pillar = pillarSlug ? PILLAR_BY_SLUG[pillarSlug] : null;
          const isToday = k === todayKey;
          const kd = keyDates.get(k);
          return (
            <Tooltip key={k}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "relative flex aspect-square items-center justify-center overflow-hidden rounded-[3px] text-[9px] tabular-nums",
                    !inMonth && "opacity-30",
                    isToday && "ring-foreground ring-1",
                    lv === 0 && "text-muted-foreground/50",
                  )}
                >
                  {inMonth && lv > 0 && (
                    <span
                      className="absolute inset-0"
                      style={{
                        background: pillar?.color ?? "var(--color-emerald-500)",
                        opacity: PILLAR_OPACITY[lv],
                      }}
                    />
                  )}
                  <span className="relative">
                    {kd && lv === 0 ? kd.emoji : d.getDate()}
                  </span>
                </span>
              </TooltipTrigger>
              {inMonth && (dayEntries.length > 0 || kd) && (
                <TooltipContent>
                  <span className="font-medium">
                    {name} {d.getDate()}
                  </span>
                  {dayEntries.length > 0 && (
                    <span className="text-muted-foreground block text-xs">
                      {dayEntries.length} post{dayEntries.length === 1 ? "" : "s"}
                      {pillar ? ` · mostly ${pillar.name}` : ""}
                    </span>
                  )}
                  {kd && (
                    <span className="text-muted-foreground block text-xs">
                      {kd.emoji} {kd.name}
                    </span>
                  )}
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

// ---- Year · Detailed (12 month grids — the same MonthGrid, compact density) -

/** Post count for a month — drives the Detailed header badge. */
function useMonthTotal(
  year: number,
  month: number,
  byDay: Map<string, CalEntry[]>,
) {
  const weeks = useMemo(() => monthWeeks(year, month), [year, month]);
  return useMemo(() => {
    let n = 0;
    for (const week of weeks)
      for (const d of week)
        if (d.getMonth() === month) n += byDay.get(keyOf(d))?.length ?? 0;
    return n;
  }, [weeks, month, byDay]);
}

function YearMonthsDetailed({
  months,
  byDay,
  todayKey,
  onDayClick,
  onMonthClick,
  onEvaluate,
  onGenerate,
}: {
  months: { year: number; month: number }[];
  byDay: Map<string, CalEntry[]>;
  todayKey: string;
  onDayClick: (date: Date) => void;
  onMonthClick: (year: number, month: number) => void;
  onEvaluate: (year: number, month: number) => void;
  onGenerate: (year: number, month: number) => void;
}) {
  const firstYear = months[0]?.year;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {months.map(({ year, month }) => (
        <DetailedMonth
          key={`${year}-${month}`}
          name={year === firstYear ? MONTHS[month]! : `${MONTHS[month]} ${year}`}
          year={year}
          month={month}
          byDay={byDay}
          todayKey={todayKey}
          onDayClick={onDayClick}
          onMonthClick={() => onMonthClick(year, month)}
          onEvaluate={() => onEvaluate(year, month)}
          onGenerate={() => onGenerate(year, month)}
        />
      ))}
    </div>
  );
}

function DetailedMonth({
  name,
  year,
  month,
  byDay,
  todayKey,
  onDayClick,
  onMonthClick,
  onEvaluate,
  onGenerate,
}: {
  name: string;
  year: number;
  month: number;
  byDay: Map<string, CalEntry[]>;
  todayKey: string;
  onDayClick: (date: Date) => void;
  onMonthClick: () => void;
  onEvaluate: () => void;
  onGenerate: () => void;
}) {
  const total = useMonthTotal(year, month, byDay);
  return (
    <MonthGrid
      year={year}
      month={month}
      byDay={byDay}
      todayKey={todayKey}
      onDayClick={onDayClick}
      header={{ name, total, onMonthClick, onEvaluate, onGenerate }}
    />
  );
}

// ---- Year · Heatmap (GitHub-style density band) --------------------------

function Heatmap({
  year,
  byDay,
  todayKey,
  onDayClick,
}: {
  year: number;
  byDay: Map<string, CalEntry[]>;
  todayKey: string;
  onDayClick: (date: Date) => void;
}) {
  const cols = useMemo(() => yearColumns(year), [year]);
  // Month label above the column where each month first appears (top cell).
  const monthLabels = useMemo(() => {
    const labels: { col: number; name: string }[] = [];
    let prev = -1;
    cols.forEach((col, i) => {
      const m = col[0]!.getMonth();
      const inYear = col[0]!.getFullYear() === year;
      if (inYear && m !== prev) {
        labels.push({ col: i, name: MONTHS_SHORT[m]! });
        prev = m;
      }
    });
    return labels;
  }, [cols, year]);

  return (
    <div className="overflow-x-auto rounded-xl border p-4">
      <div className="inline-flex flex-col gap-1.5">
        {/* Month axis (offset must match the weekday rail width + gap: 24px + 4px) */}
        <div className="text-muted-foreground relative ml-7 h-3 text-[10px]">
          {monthLabels.map((l) => (
            <span key={l.col} className="absolute" style={{ left: l.col * 15 }}>
              {l.name}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {/* Weekday rail — single letters, right-aligned against the grid */}
          <div className="text-muted-foreground mr-1 flex w-6 flex-col gap-[3px] text-[9px]">
            {WEEKDAYS.map((w, i) => (
              <span key={w} className="flex h-3 items-center justify-end">
                {i % 2 === 0 ? w[0] : ""}
              </span>
            ))}
          </div>
          {/* Week columns */}
          {cols.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-[3px]">
              {col.map((d) => {
                const k = keyOf(d);
                const inYear = d.getFullYear() === year;
                const n = byDay.get(k)?.length ?? 0;
                const lv = level(n);
                return (
                  <Tooltip key={k}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => inYear && onDayClick(d)}
                        className={cn(
                          "size-3 rounded-[2px]",
                          inYear ? HEAT_BG[lv] : "bg-transparent",
                          k === todayKey && "ring-foreground ring-1",
                        )}
                      />
                    </TooltipTrigger>
                    {inYear && (
                      <TooltipContent>
                        <span className="font-medium">
                          {MONTHS_SHORT[d.getMonth()]} {d.getDate()}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {n} post{n === 1 ? "" : "s"}
                        </span>
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Day detail dialog ---------------------------------------------------

function DayDetailDialog({
  date,
  entries,
  assign,
  onClose,
  onProduce,
}: {
  date: Date | null;
  entries: CalEntry[];
  assign: CalAssign;
  onClose: () => void;
  onProduce: (date: Date) => void;
}) {
  const groups = useMemo(() => groupDay(entries), [entries]);
  return (
    <SimpleDialog
      open={!!date}
      onOpenChange={(o) => !o && onClose()}
      title={
        date
          ? date.toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })
          : ""
      }
      size="lg"
      scrollable
    >
      {date && (
        <button
          onClick={() => onProduce(date)}
          className="border-border hover:bg-accent mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-sm font-medium transition-colors"
        >
          <Sparkles className="size-4" />
          Draft content for this day
        </button>
      )}
      {groups.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Nothing planned for this day.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <DayGroupBlock key={g.key} g={g} assign={assign} />
          ))}
        </div>
      )}
    </SimpleDialog>
  );
}

/** One content piece in the day dialog: idea owner on the header (hover+Space
 *  self-toggles it), spot owner on each platform row. */
function DayGroupBlock({ g, assign }: { g: DayGroup; assign: CalAssign }) {
  const pillar = g.pillarSlug ? PILLAR_BY_SLUG[g.pillarSlug] : null;
  const first = g.entries[0];
  const tracked = first?.tracked ?? false;
  const ideaOwner = first ? assign.ideaOwnerOf(first) : null;
  // Hover + Space self-toggles the idea owner (only our own, real pieces).
  const hover = useSelfAssignHotkey({
    ownerId: ideaOwner?.id ?? null,
    currentUserId: assign.currentUserId,
    onChange: (ownerId) =>
      g.contentPostId && assign.assignIdea(g.contentPostId, ownerId),
    enabled: !!g.contentPostId && !tracked,
  });
  return (
    <div
      {...hover}
      className="rounded-lg border p-3"
      style={pillar ? { borderLeft: `3px solid ${pillar.color}` } : undefined}
    >
      <div className="mb-1.5 flex items-center gap-2">
        {g.contentPostId ? (
          <Link
            href={`/app/content/${g.contentPostId}`}
            className="min-w-0 truncate text-sm font-medium hover:underline"
          >
            {g.title ?? "Untitled"}
          </Link>
        ) : (
          <span className="min-w-0 truncate text-sm font-medium">
            {g.title ?? "Standalone post"}
          </span>
        )}
        {pillar && (
          <span className="text-muted-foreground shrink-0 text-xs">{pillar.name}</span>
        )}
        <span className="text-muted-foreground ml-auto shrink-0 text-xs">
          {first?.brandName}
        </span>
        {g.contentPostId && !tracked && (
          <AssigneeButton
            value={ideaOwner}
            members={assign.members}
            currentUserId={assign.currentUserId}
            onChange={(ownerId) => assign.assignIdea(g.contentPostId!, ownerId)}
            size="sm"
            label="Assign owner"
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {g.entries.map((e) => (
          <div key={e.id} className="flex items-center gap-2 text-xs">
            <ChannelLogo platform={e.platform} className="size-4 shrink-0" />
            <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[e.status] ?? "bg-slate-400")} />
            <span className="text-muted-foreground shrink-0 capitalize">{e.status}</span>
            {e.text && <span className="min-w-0 flex-1 truncate">· {e.text}</span>}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {e.externalUrl && (
                <a
                  href={e.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(ev) => ev.stopPropagation()}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ↗
                </a>
              )}
              {!e.tracked && (
                <AssigneeButton
                  value={assign.spotOwnerOf(e)}
                  members={assign.members}
                  currentUserId={assign.currentUserId}
                  onChange={(ownerId) => assign.assignSpot(e.id, ownerId)}
                  size="sm"
                  label="Assign this channel"
                />
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- shared bits ---------------------------------------------------------

function NavStepper({
  onPrev,
  onNext,
  label,
}: {
  onPrev: () => void;
  onNext: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onPrev}
        className="border-border hover:bg-accent flex size-7 items-center justify-center rounded-md border transition-colors"
        aria-label="Previous"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-32 text-center text-sm font-semibold">{label}</span>
      <button
        onClick={onNext}
        className="border-border hover:bg-accent flex size-7 items-center justify-center rounded-md border transition-colors"
        aria-label="Next"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
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

function Legend({ mode }: { mode: "status" | "heat" }) {
  if (mode === "heat") {
    return (
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
        <span>Less</span>
        {HEAT_BG.map((bg, i) => (
          <span key={i} className={cn("size-3 rounded-[2px]", bg)} />
        ))}
        <span>More</span>
      </div>
    );
  }
  const items: { label: string; status: string }[] = [
    { label: "Draft", status: "draft" },
    { label: "Scheduled", status: "scheduled" },
    { label: "Published", status: "published" },
  ];
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
      {items.map((it) => (
        <span key={it.status} className="flex items-center gap-1">
          <span className={cn("size-1.5 rounded-full", STATUS_DOT[it.status])} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ---- Month report (the "Evaluate" CTA) -------------------------------------

const REPORT_STATUS: { key: string; label: string; cls: string }[] = [
  { key: "slot", label: "Open slots", cls: "border-amber-500/40 text-amber-400" },
  { key: "discovered", label: "Discovered", cls: "border-border text-muted-foreground" },
  { key: "draft", label: "Draft", cls: "border-border text-muted-foreground" },
  { key: "pending_review", label: "In review", cls: "border-border text-muted-foreground" },
  { key: "approved", label: "Approved", cls: "border-sky-500/40 text-sky-400" },
  { key: "scheduled", label: "Scheduled", cls: "border-sky-500/40 text-sky-400" },
  { key: "published", label: "Published", cls: "border-emerald-500/40 text-emerald-400" },
];

/** Month-at-a-glance: what's on the calendar, in what state, on which
 *  platforms, in what pillar mix — plus the two next actions (generate the
 *  skeleton / open the month). Computed from the already-filtered entries so
 *  it respects the page's brand/pillar/Mine filters. */
function MonthReportDialog({
  target,
  entries,
  onClose,
  onGenerate,
  onOpenMonth,
}: {
  target: { year: number; month: number } | null;
  entries: CalEntry[];
  onClose: () => void;
  onGenerate: (year: number, month: number) => void;
  onOpenMonth: (year: number, month: number) => void;
}) {
  const report = useMemo(() => {
    if (!target) return null;
    const rows = entries.filter((e) => {
      const d = new Date(e.at);
      return d.getFullYear() === target.year && d.getMonth() === target.month;
    });
    const count = (pick: (e: CalEntry) => string | null) => {
      const m = new Map<string, number>();
      for (const e of rows) {
        const k = pick(e);
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return m;
    };
    return {
      rows,
      ours: rows.filter((e) => !e.tracked),
      trackedCount: rows.filter((e) => e.tracked).length,
      byStatus: count((e) => e.status),
      byPlatform: [...count((e) => (e.tracked ? null : e.platform)).entries()].sort(
        (a, b) => b[1] - a[1],
      ),
      byPillar: [...count((e) => (e.tracked ? null : (e.pillar ?? "__unsorted"))).entries()].sort(
        (a, b) => b[1] - a[1],
      ),
    };
  }, [target, entries]);

  if (!target || !report) return null;
  const monthLabel = `${MONTHS[target.month]} ${target.year}`;
  const pillarTotal = report.byPillar.reduce((n, [, c]) => n + c, 0);
  const pillarColorOf = (slug: string) =>
    slug === "__unsorted"
      ? "var(--color-muted-foreground)"
      : (PILLAR_BY_SLUG[slug]?.color ?? "var(--color-muted-foreground)");

  return (
    <SimpleDialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`${monthLabel} — month report`}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button
            onClick={() => onOpenMonth(target.year, target.month)}
            className="border-border hover:bg-accent rounded-full border px-4 py-1.5 text-sm"
          >
            Open month
          </button>
          <button
            onClick={() => onGenerate(target.year, target.month)}
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Generate slots
          </button>
        </div>
      }
    >
      {report.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing on the calendar for {monthLabel} yet — generate the month&apos;s
          slot skeleton to get started.
        </p>
      ) : (
        <div className="space-y-4">
          {/* pipeline state */}
          <div className="flex flex-wrap gap-1.5">
            {REPORT_STATUS.map(({ key, label, cls }) => {
              const n = report.byStatus.get(key) ?? 0;
              if (n === 0) return null;
              return (
                <span
                  key={key}
                  className={cn("rounded-full border px-2 py-0.5 text-[11px] tabular-nums", cls)}
                >
                  {label} {n}
                </span>
              );
            })}
            {report.trackedCount > 0 && (
              <span className="border-border text-muted-foreground/70 rounded-full border border-dashed px-2 py-0.5 text-[11px] tabular-nums">
                tracked brands {report.trackedCount}
              </span>
            )}
          </div>

          {/* platforms */}
          {report.byPlatform.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {report.byPlatform.map(([platform, n]) => (
                <span key={platform} className="flex items-center gap-1.5 text-xs">
                  <ChannelLogo platform={platform} className="size-3.5" />
                  <span className="text-muted-foreground tabular-nums">{n}</span>
                </span>
              ))}
            </div>
          )}

          {/* pillar mix */}
          {pillarTotal > 0 && (
            <div>
              <div className="bg-muted/40 flex h-2 overflow-hidden rounded-full">
                {report.byPillar.map(([slug, n]) => (
                  <span
                    key={slug}
                    title={`${slug === "__unsorted" ? "Unsorted" : (PILLAR_BY_SLUG[slug]?.name ?? slug)} · ${Math.round((n / pillarTotal) * 100)}%`}
                    style={{
                      width: `${(n / pillarTotal) * 100}%`,
                      background: pillarColorOf(slug),
                    }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {report.byPillar.map(([slug, n]) => (
                  <span key={slug} className="flex items-center gap-1 text-[11px]">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: pillarColorOf(slug) }}
                    />
                    <span className="text-muted-foreground">
                      {slug === "__unsorted" ? "Unsorted" : (PILLAR_BY_SLUG[slug]?.name ?? slug)}
                    </span>
                    <span className="text-muted-foreground/70 tabular-nums">
                      {Math.round((n / pillarTotal) * 100)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SimpleDialog>
  );
}
