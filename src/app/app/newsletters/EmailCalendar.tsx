"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { monthWeeks } from "@/lib/calendar-dates";

type Entry = { id: string; title: string; stage: string; at: string };
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export function EmailCalendar({
  entries,
  renderEmail,
}: {
  entries: Entry[];
  renderEmail: (id: string) => ReactNode;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const byDay = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = dayKey(new Date(entry.at));
    const day = byDay.get(key) ?? [];
    day.push(entry);
    byDay.set(key, day);
  }
  for (const day of byDay.values())
    day.sort((a, b) => a.at.localeCompare(b.at));
  const todayKey = dayKey(new Date());
  const weeks = monthWeeks(month.getFullYear(), month.getMonth());
  const monthCount = entries.filter((entry) => {
    const date = new Date(entry.at);
    return (
      date.getMonth() === month.getMonth() &&
      date.getFullYear() === month.getFullYear()
    );
  }).length;
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ChevronLeft />
          </Button>
          <h3 aria-live="polite" className="text-sm font-semibold">
            {month.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}{" "}
            <span className="ml-1 font-normal text-muted-foreground">
              {monthCount}
            </span>
          </h3>
          <Button
            variant="outline"
            size="icon"
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
      <p className="text-xs text-muted-foreground">
        Draft dates are calendar plans. Scheduled emails have delivery
        scheduled. Sent emails appear on their send date.
      </p>
      <div className="overflow-x-auto rounded-xl border">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-7 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="px-2 py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {weeks.flat().map((date) => {
              const key = dayKey(date);
              const dayEntries = byDay.get(key) ?? [];
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!dayEntries.length}
                  onClick={() => setSelectedDay(date)}
                  aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${dayEntries.length} ${dayEntries.length === 1 ? "email" : "emails"}`}
                  className={cn(
                    "flex min-h-28 min-w-0 flex-col gap-1 border-r border-b p-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none enabled:hover:bg-accent/30 [&:nth-child(7n)]:border-r-0",
                    date.getMonth() !== month.getMonth() &&
                      "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      key === todayKey &&
                        "bg-foreground font-semibold text-background",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {dayEntries.slice(0, 3).map((entry) => (
                    <span
                      key={entry.id}
                      className="block w-full rounded border bg-card px-1.5 py-1 text-xs"
                    >
                      <span className="block text-[10px] text-muted-foreground">
                        {entry.stage === "Drafts" ? "Draft" : entry.stage}
                      </span>
                      <span className="line-clamp-2 font-medium break-words">
                        {entry.title}
                      </span>
                    </span>
                  ))}
                  {dayEntries.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{dayEntries.length - 3} more
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {!monthCount && (
        <p className="text-sm text-muted-foreground">
          No dated emails this month.
        </p>
      )}
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
            year: "numeric",
          }) ?? "Emails"
        }
        size="xl"
        scrollable
      >
        <div className="space-y-3">
          {selectedDay &&
            (byDay.get(dayKey(selectedDay)) ?? []).map((entry) =>
              renderEmail(entry.id),
            )}
        </div>
      </SimpleDialog>
    </div>
  );
}
