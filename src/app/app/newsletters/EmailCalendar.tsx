"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Mail,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { monthWeeks } from "@/lib/calendar-dates";
import { toDateInputValue } from "@/components/ui/date-picker";

export type EmailCalendarEntry = {
  id: string;
  title: string;
  stage: string;
  at: string;
  thumbnail?: string | null;
};
const statusLabel = (stage: string) =>
  stage === "Drafts" || stage === "Ready" ? "Tentative" : stage;
const dateKey = (value: string, timeZone?: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

export function EmailCalendar({
  entries,
  renderEmail,
  timeZone,
  timeZoneLabel,
  onOpen,
  onPlan,
  onMove,
}: {
  entries: EmailCalendarEntry[];
  renderEmail: (id: string) => ReactNode;
  timeZone?: string;
  timeZoneLabel?: string;
  onOpen?: (id: string) => void;
  onPlan?: (date: Date) => void;
  onMove?: (id: string, day: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const suppressClick = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const byDay = new Map<string, EmailCalendarEntry[]>();
  for (const entry of entries) {
    const key = dateKey(entry.at, timeZone);
    const day = byDay.get(key) ?? [];
    day.push(entry);
    byDay.set(key, day);
  }
  for (const day of byDay.values())
    day.sort((a, b) => a.at.localeCompare(b.at));
  const weeks = monthWeeks(month.getFullYear(), month.getMonth());
  const todayKey = dateKey(new Date().toISOString(), timeZone);
  const openEntry = (id: string, date: Date) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (onOpen) onOpen(id);
    else setSelectedDay(date);
  };
  return (
    <div className="@container min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3
            aria-live="polite"
            className="text-lg font-semibold tracking-tight"
          >
            {month.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const now = new Date();
              setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            Today
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {timeZoneLabel ?? "Your local time"}
        </span>
      </div>
      <DndContext
        sensors={sensors}
        onDragEnd={(event) => {
          if (event.over && event.over.id !== event.active.data.current?.day) {
            suppressClick.current = true;
            onMove?.(String(event.active.id), String(event.over.id));
          }
        }}
      >
        <div className="overflow-x-auto rounded-xl border">
          <div className="min-w-[350px]">
            <div className="grid grid-cols-7 border-b bg-muted/20 text-[11px] font-medium text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className="px-3 py-2.5">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {weeks.flat().map((date) => (
                <Day
                  key={toDateInputValue(date)}
                  date={date}
                  inMonth={date.getMonth() === month.getMonth()}
                  today={toDateInputValue(date) === todayKey}
                  entries={byDay.get(toDateInputValue(date)) ?? []}
                  timeZone={timeZone}
                  canMove={Boolean(onMove)}
                  onPlan={onPlan}
                  onOpen={(id) => openEntry(id, date)}
                />
              ))}
            </div>
          </div>
        </div>
      </DndContext>
      <div className="space-y-2 @2xl:hidden">
        {entries
          .filter((entry) =>
            dateKey(entry.at, timeZone).startsWith(
              toDateInputValue(month).slice(0, 7),
            ),
          )
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => openEntry(entry.id, new Date(entry.at))}
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left hover:bg-muted/20"
            >
              <span className="flex w-12 shrink-0 flex-col items-center text-xs text-muted-foreground">
                <span>
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone,
                    weekday: "short",
                  }).format(new Date(entry.at))}
                </span>
                <span className="text-xl font-semibold text-foreground">
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone,
                    day: "numeric",
                  }).format(new Date(entry.at))}
                </span>
              </span>
              {entry.thumbnail && (
                <img
                  src={entry.thumbnail}
                  alt=""
                  className="size-14 rounded-lg object-cover"
                />
              )}
              <span className="min-w-0 space-y-1">
                <span className="line-clamp-2 block text-sm font-medium">
                  {entry.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {statusLabel(entry.stage)} ·{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone,
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(entry.at))}
                </span>
              </span>
            </button>
          ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          {["Tentative", "Approved", "Scheduled", "Sent"].map((label) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  label === "Tentative"
                    ? "bg-muted-foreground/50"
                    : label === "Approved"
                      ? "bg-foreground/60"
                      : "bg-primary",
                )}
              />
              {label}
            </span>
          ))}
        </div>
        {onMove && (
          <span className="hidden @2xl:inline">
            Drag to move a tentative date
          </span>
        )}
      </div>
      <SimpleDialog
        open={selectedDay !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
        title={
          selectedDay?.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          }) ?? "Emails"
        }
        size="xl"
        scrollable
      >
        <div className="space-y-3">
          {selectedDay &&
            (byDay.get(toDateInputValue(selectedDay)) ?? []).map((entry) =>
              renderEmail(entry.id),
            )}
        </div>
      </SimpleDialog>
    </div>
  );
}

function Day({
  date,
  inMonth,
  today,
  entries,
  timeZone,
  canMove,
  onPlan,
  onOpen,
}: {
  date: Date;
  inMonth: boolean;
  today: boolean;
  entries: EmailCalendarEntry[];
  timeZone?: string;
  canMove: boolean;
  onPlan?: (date: Date) => void;
  onOpen: (id: string) => void;
}) {
  const day = toDateInputValue(date);
  const { setNodeRef, isOver } = useDroppable({ id: day, disabled: !canMove });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/day flex min-h-16 min-w-0 flex-col gap-2 border-r border-b p-1 @2xl:min-h-36 @2xl:p-2 [&:nth-child(7n)]:border-r-0",
        !inMonth && "bg-muted/20",
        isOver && "bg-accent/50 ring-1 ring-ring ring-inset",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
            !inMonth && "text-muted-foreground/50",
            today && "bg-foreground font-semibold text-background",
          )}
        >
          {date.getDate()}
        </span>
        {onPlan && (
          <button
            type="button"
            onClick={() => onPlan(date)}
            aria-label={`Plan email for ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`}
            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover/day:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      {entries.length > 0 && (
        <button
          type="button"
          className="rounded bg-accent px-1 py-1 text-[10px] font-medium @2xl:hidden"
          onClick={() => onOpen(entries[0]!.id)}
          aria-label={`${entries.length} email${entries.length === 1 ? "" : "s"} on ${date.toLocaleDateString()}`}
        >
          {entries.length} email{entries.length === 1 ? "" : "s"}
        </button>
      )}
      {entries.map((entry) => (
        <div key={entry.id} className="hidden @2xl:block">
          <CalendarEmail
            key={entry.id}
            entry={entry}
            day={day}
            timeZone={timeZone}
            canMove={canMove}
            onOpen={onOpen}
          />
        </div>
      ))}
      {!entries.length && onPlan && (
        <button
          type="button"
          onClick={() => onPlan(date)}
          aria-label={`Add email on ${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`}
          className="hidden min-h-16 flex-1 items-center justify-center rounded-lg text-xs text-muted-foreground opacity-0 transition-opacity group-hover/day:bg-muted/30 group-hover/day:opacity-100 focus-visible:opacity-100 @2xl:flex"
        >
          Plan email
        </button>
      )}
    </div>
  );
}
function CalendarEmail({
  entry,
  day,
  timeZone,
  canMove,
  onOpen,
}: {
  entry: EmailCalendarEntry;
  day: string;
  timeZone?: string;
  canMove: boolean;
  onOpen: (id: string) => void;
}) {
  const movable = canMove && !["Scheduled", "Sent"].includes(entry.stage);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.id,
    data: { day },
    disabled: !movable,
  });
  const label = statusLabel(entry.stage);
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={() => onOpen(entry.id)}
      aria-label={`${entry.title}, ${label}`}
      className={cn(
        "group/email relative w-full overflow-hidden rounded-lg border bg-card text-left shadow-xs transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        label === "Tentative" && "border-dashed",
        movable && "cursor-grab touch-none",
        isDragging && "opacity-40",
      )}
    >
      {entry.thumbnail && (
        <img
          src={entry.thumbnail}
          alt=""
          className="hidden h-12 w-full object-cover @3xl:block @4xl:h-16"
          loading="lazy"
        />
      )}
      <span className="block space-y-1.5 p-2">
        <span className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Mail className="size-3" />
            {new Intl.DateTimeFormat("en-US", {
              timeZone,
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(entry.at))}
          </span>
          {movable && (
            <GripVertical className="size-3 opacity-0 group-hover/email:opacity-100" />
          )}
        </span>
        <span className="line-clamp-3 block text-[11px] leading-snug font-medium break-words">
          {entry.title}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[10px]",
            ["Scheduled", "Sent"].includes(label)
              ? "text-primary"
              : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "size-1 rounded-full",
              label === "Tentative" ? "bg-muted-foreground/50" : "bg-current",
            )}
          />
          {label}
        </span>
      </span>
    </button>
  );
}
