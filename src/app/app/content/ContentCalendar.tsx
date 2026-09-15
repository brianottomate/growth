"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import { ChannelLogo } from "@/components/channel-logos";
import { cn } from "@/components/ui/lib/utils";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import type { RouterOutputs } from "@/trpc/react";

type Row = RouterOutputs["content"]["schedule"][number];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const STATUS_DOT: Record<string, string> = {
  published: "bg-emerald-500",
  scheduled: "bg-sky-500",
  approved: "bg-amber-500",
  pending_review: "bg-amber-500",
  draft: "bg-slate-400",
  discovered: "bg-violet-400",
  slot: "bg-slate-500",
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
/** Droppable id — the day at noon (avoids UTC off-by-one when re-scheduling). */
const dayDropId = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString();
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function monthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = addDays(first, -mondayIndex(first));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((mondayIndex(first) + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
  );
}

/** Spot-first month grid for /content. Drag a chip to another day to reschedule
 *  that channel spot (manual, until auto-publish). Same data as the Schedule
 *  view; the richer year/heatmap stays at /app/calendar. */
export function ContentCalendar({
  rows,
  onReschedule,
  onOpen,
}: {
  rows: Row[];
  onReschedule: (spotId: string, dateISO: string) => void;
  onOpen: (contentPostId: string) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const suppressClick = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      if (!r.at) continue;
      const k = dayKey(new Date(r.at));
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return m;
  }, [rows]);

  const weeks = useMemo(() => monthWeeks(year, month), [year, month]);
  const todayKey = dayKey(now);

  const prev = () =>
    month === 0 ? (setYear(year - 1), setMonth(11)) : setMonth(month - 1);
  const next = () =>
    month === 11 ? (setYear(year + 1), setMonth(0)) : setMonth(month + 1);

  const onDragEnd = (e: DragEndEvent) => {
    suppressClick.current = true;
    const overId = e.over?.id as string | undefined;
    const spotId = e.active.id as string;
    if (overId) onReschedule(spotId, overId);
  };

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={prev}
          className="flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-36 text-center text-sm font-semibold">
          {MONTHS[month]} {year}
        </span>
        <button
          onClick={next}
          className="flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent"
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          onClick={() => {
            setYear(now.getFullYear());
            setMonth(now.getMonth());
          }}
          className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
        >
          Today
        </button>
        <Link
          href="/app/calendar"
          className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
        >
          Year view ↗
        </Link>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-7 border-b bg-muted/30 text-[11px] font-medium text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-1.5">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {weeks.flat().map((date) => (
              <DayCell
                key={dayDropId(date)}
                date={date}
                inMonth={date.getMonth() === month}
                isToday={dayKey(date) === todayKey}
                spots={byDay.get(dayKey(date)) ?? []}
                onOpen={onOpen}
                suppressClick={suppressClick}
              />
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function DayCell({
  date,
  inMonth,
  isToday,
  spots,
  onOpen,
  suppressClick,
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  spots: Row[];
  onOpen: (contentPostId: string) => void;
  suppressClick: RefObject<boolean>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(date) });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-28 flex-col gap-1 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0",
        !inMonth && "bg-muted/20 opacity-50",
        isOver && "bg-accent/40",
      )}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
          isToday
            ? "bg-foreground font-semibold text-background"
            : "text-muted-foreground",
        )}
      >
        {date.getDate()}
      </span>
      <div className="flex flex-col gap-1">
        {spots.map((s) => (
          <CalChip
            key={s.id}
            spot={s}
            onOpen={onOpen}
            suppressClick={suppressClick}
          />
        ))}
      </div>
    </div>
  );
}

function CalChip({
  spot,
  onOpen,
  suppressClick,
}: {
  spot: Row;
  onOpen: (contentPostId: string) => void;
  suppressClick: RefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: spot.id,
  });
  const pillar = spot.pillar ? PILLAR_BY_SLUG[spot.pillar] : null;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (spot.contentPostId) onOpen(spot.contentPostId);
      }}
      className={cn(
        "flex cursor-grab touch-none items-center gap-1 overflow-hidden rounded-md border bg-card p-1 text-[11px]",
        spot.status === "slot" && "border-dashed bg-transparent opacity-75",
        isDragging && "opacity-40",
      )}
      style={pillar ? { borderLeft: `2px solid ${pillar.color}` } : undefined}
      title={spot.title ?? undefined}
    >
      <ChannelLogo
        platform={spot.format === "newsletter.blast" ? "blast" : spot.platform}
        className="size-3.5 shrink-0"
      />
      {spot.mediaUrl && (
        // oxlint-disable-next-line nextjs/no-img-element
        <img
          src={spot.mediaUrl}
          alt=""
          className="size-4 shrink-0 rounded-sm border object-cover"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
      <span className="min-w-0 flex-1 truncate leading-tight">
        {spot.title ?? "Untitled"}
      </span>
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          STATUS_DOT[spot.status] ?? "bg-slate-400",
        )}
      />
    </div>
  );
}
