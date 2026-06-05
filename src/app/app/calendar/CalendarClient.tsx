"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

import { ProduceDrawer } from "@/app/app/studio/ProduceDrawer";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { SimpleDialog } from "@/components/ui/dialog";
import { SimpleSelect } from "@/components/ui/select";
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
  handle: string | null;
  at: string; // ISO — effective day (published ?? scheduled ?? planned ?? created)
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
  nowISO,
  initial,
}: {
  entries: CalEntry[];
  brands: { id: string; name: string; slug: string | null }[];
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

  const [zoom, setZoom] = useState<Zoom>("month");
  const [yearMode, setYearMode] = useState<YearMode>("months");
  const [year, setYear] = useState(initial?.year ?? now.getFullYear());
  const [month, setMonth] = useState(initial?.month ?? now.getMonth());
  const [brandFilter, setBrandFilter] = useState(initial?.brandId ?? "all");
  const [pillarFilter, setPillarFilter] = useState(initial?.pillar ?? "all");
  const [dayDetail, setDayDetail] = useState<{ key: string; date: Date } | null>(null);
  const [produceDate, setProduceDate] = useState<string | null>(null);

  const { ref, style } = useFullBleed();

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
        return true;
      }),
    [entries, brandFilter, pillarFilter],
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
    for (const { keyDate, date } of keyDatesForYear(year)) {
      m.set(keyOf(date), { emoji: keyDate.emoji, name: keyDate.name });
    }
    return m;
  }, [year]);

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
              : `${year} · ${filtered.length} posts`}
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
              onPrev={() => setYear(year - 1)}
              onNext={() => setYear(year + 1)}
              label={String(year)}
            />
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
            keyDates={keyDates}
            todayKey={todayKey}
            onDayClick={(date) => setDayDetail({ key: keyOf(date), date })}
          />
        ) : yearMode === "months" ? (
          <YearMonths
            year={year}
            byDay={byDay}
            keyDates={keyDates}
            todayKey={todayKey}
            onMonthClick={(mo) => openMonth(year, mo)}
          />
        ) : yearMode === "detailed" ? (
          <YearMonthsDetailed
            year={year}
            byDay={byDay}
            keyDates={keyDates}
            todayKey={todayKey}
            onDayClick={(date) => setDayDetail({ key: keyOf(date), date })}
            onMonthClick={(mo) => openMonth(year, mo)}
          />
        ) : (
          <Heatmap year={year} byDay={byDay} todayKey={todayKey} onDayClick={(d) => openMonth(d.getFullYear(), d.getMonth())} />
        )}
      </div>

      <DayDetailDialog
        date={dayDetail?.date ?? null}
        entries={dayDetail ? (byDay.get(dayDetail.key) ?? []) : []}
        onClose={() => setDayDetail(null)}
        onProduce={(date) => {
          setDayDetail(null);
          setProduceDate(date.toISOString());
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

// ---- Month view ----------------------------------------------------------

function MonthGrid({
  year,
  month,
  byDay,
  keyDates,
  todayKey,
  onDayClick,
}: {
  year: number;
  month: number;
  byDay: Map<string, CalEntry[]>;
  keyDates: Map<string, { emoji: string; name: string }>;
  todayKey: string;
  onDayClick: (date: Date) => void;
}) {
  const weeks = useMemo(() => monthWeeks(year, month), [year, month]);

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="bg-muted/30 text-muted-foreground grid grid-cols-7 border-b text-[11px] font-medium">
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
          const kd = keyDates.get(k);
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
                {kd && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs leading-none">{kd.emoji}</span>
                    </TooltipTrigger>
                    <TooltipContent>{kd.name}</TooltipContent>
                  </Tooltip>
                )}
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
  const label =
    g.title ?? g.entries[0]?.text ?? platformLabel(g.entries[0]?.platform ?? "");
  return (
    <span
      className="bg-card flex items-center gap-1 overflow-hidden rounded border px-1 py-0.5 text-[11px]"
      style={pillar ? { borderLeft: `2px solid ${pillar.color}` } : undefined}
      title={label}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status] ?? "bg-slate-400")} />
      <span className="truncate">{label}</span>
      {g.entries.length > 1 && (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          ×{g.entries.length}
        </span>
      )}
    </span>
  );
}

/** Denser chip for the year · detailed view, where day cells are narrow. */
function CompactChip({ g }: { g: DayGroup }) {
  const pillar = g.pillarSlug ? PILLAR_BY_SLUG[g.pillarSlug] : null;
  const status = g.entries[0]?.status ?? "draft";
  const label =
    g.title ?? g.entries[0]?.text ?? platformLabel(g.entries[0]?.platform ?? "");
  return (
    <span
      className="bg-card flex items-center gap-1 overflow-hidden rounded-[3px] border px-1 py-px text-[10px] leading-tight"
      style={pillar ? { borderLeft: `2px solid ${pillar.color}` } : undefined}
      title={label}
    >
      <span className={cn("size-1 shrink-0 rounded-full", STATUS_DOT[status] ?? "bg-slate-400")} />
      <span className="truncate">{label}</span>
      {g.entries.length > 1 && (
        <span className="text-muted-foreground shrink-0 tabular-nums">×{g.entries.length}</span>
      )}
    </span>
  );
}

// ---- Year · Months (mini calendars, pillar-tinted) ------------------------

function YearMonths({
  year,
  byDay,
  keyDates,
  todayKey,
  onMonthClick,
}: {
  year: number;
  byDay: Map<string, CalEntry[]>;
  keyDates: Map<string, { emoji: string; name: string }>;
  todayKey: string;
  onMonthClick: (month: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {MONTHS.map((name, mo) => (
        <MiniMonth
          key={mo}
          name={name}
          year={year}
          month={mo}
          byDay={byDay}
          keyDates={keyDates}
          todayKey={todayKey}
          onClick={() => onMonthClick(mo)}
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
}: {
  name: string;
  year: number;
  month: number;
  byDay: Map<string, CalEntry[]>;
  keyDates: Map<string, { emoji: string; name: string }>;
  todayKey: string;
  onClick: () => void;
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
    <button
      onClick={onClick}
      className="hover:border-foreground/30 group rounded-lg border p-2.5 text-left transition-colors"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold group-hover:underline">{name}</span>
        {total > 0 && (
          <span className="text-muted-foreground text-[11px] tabular-nums">{total}</span>
        )}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-muted-foreground/60 text-center text-[8px]">
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
    </button>
  );
}

// ---- Year · Detailed (12 month grids with content chips) ------------------

function YearMonthsDetailed({
  year,
  byDay,
  keyDates,
  todayKey,
  onDayClick,
  onMonthClick,
}: {
  year: number;
  byDay: Map<string, CalEntry[]>;
  keyDates: Map<string, { emoji: string; name: string }>;
  todayKey: string;
  onDayClick: (date: Date) => void;
  onMonthClick: (month: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {MONTHS.map((name, mo) => (
        <DetailedMiniMonth
          key={mo}
          name={name}
          year={year}
          month={mo}
          byDay={byDay}
          keyDates={keyDates}
          todayKey={todayKey}
          onDayClick={onDayClick}
          onMonthClick={() => onMonthClick(mo)}
        />
      ))}
    </div>
  );
}

function DetailedMiniMonth({
  name,
  year,
  month,
  byDay,
  keyDates,
  todayKey,
  onDayClick,
  onMonthClick,
}: {
  name: string;
  year: number;
  month: number;
  byDay: Map<string, CalEntry[]>;
  keyDates: Map<string, { emoji: string; name: string }>;
  todayKey: string;
  onDayClick: (date: Date) => void;
  onMonthClick: () => void;
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
    <div className="overflow-hidden rounded-xl border">
      <div className="bg-muted/30 flex items-center justify-between border-b px-2.5 py-1.5">
        <button onClick={onMonthClick} className="text-sm font-semibold hover:underline">
          {name}
        </button>
        {total > 0 && (
          <span className="text-muted-foreground text-[11px] tabular-nums">{total}</span>
        )}
      </div>
      <div className="bg-muted/20 text-muted-foreground grid grid-cols-7 border-b text-[9px] font-medium">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 py-0.5">
            {w[0]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((date) => {
          const k = keyOf(date);
          const inMonth = date.getMonth() === month;
          const isToday = k === todayKey;
          const kd = keyDates.get(k);
          const groups = groupDay(byDay.get(k) ?? []);
          const shown = groups.slice(0, 2);
          const extra = groups.length - shown.length;
          return (
            <button
              key={k}
              onClick={() => onDayClick(date)}
              className={cn(
                "group hover:bg-accent/30 flex min-h-16 flex-col gap-0.5 border-b border-r p-1 text-left transition-colors [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-muted/20 opacity-40",
              )}
            >
              <div className="flex items-center gap-0.5">
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[9px] tabular-nums",
                    isToday
                      ? "bg-foreground text-background font-semibold"
                      : "text-muted-foreground",
                  )}
                >
                  {date.getDate()}
                </span>
                {kd && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] leading-none">{kd.emoji}</span>
                    </TooltipTrigger>
                    <TooltipContent>{kd.name}</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {shown.map((g) => (
                  <CompactChip key={g.key} g={g} />
                ))}
                {extra > 0 && (
                  <span className="text-muted-foreground px-0.5 text-[9px]">+{extra}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
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
  onClose,
  onProduce,
}: {
  date: Date | null;
  entries: CalEntry[];
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
          {groups.map((g) => {
            const pillar = g.pillarSlug ? PILLAR_BY_SLUG[g.pillarSlug] : null;
            return (
              <div
                key={g.key}
                className="rounded-lg border p-3"
                style={pillar ? { borderLeft: `3px solid ${pillar.color}` } : undefined}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  {g.contentPostId ? (
                    <Link
                      href={`/app/content/${g.contentPostId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {g.title ?? "Untitled"}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{g.title ?? "Standalone post"}</span>
                  )}
                  {pillar && (
                    <span className="text-muted-foreground text-xs">{pillar.name}</span>
                  )}
                  <span className="text-muted-foreground ml-auto text-xs">
                    {g.entries[0]?.brandName}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {g.entries.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 text-xs">
                      <ChannelLogo platform={e.platform} className="size-4 shrink-0" />
                      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[e.status] ?? "bg-slate-400")} />
                      <span className="text-muted-foreground capitalize">{e.status}</span>
                      {e.text && <span className="truncate">· {e.text}</span>}
                      {e.externalUrl && (
                        <a
                          href={e.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(ev) => ev.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground ml-auto shrink-0"
                        >
                          ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SimpleDialog>
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
