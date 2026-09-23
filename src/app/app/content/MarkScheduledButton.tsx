"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarIcon, ChevronDown } from "lucide-react";

import { orpc } from "@/orpc/client";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/components/ui/lib/utils";

/** "She queued it natively on the platform" hot action, shared by the Schedule
 *  rows and the content-detail spot cards. One click stamps the spot Scheduled
 *  for its planned ship day; the chevron opens a date picker (defaulted to that
 *  day) for when the platform queue date differs. */
export function MarkScheduledButton({
  contentPostId,
  spotId,
  at,
  scheduled,
  onChanged,
}: {
  contentPostId: string;
  spotId: string;
  /** The spot's effective ship date (ISO), used as the one-click default. */
  at: string | null;
  scheduled: boolean;
  onChanged: () => void;
}) {
  const [pickOpen, setPickOpen] = useState(false);
  const setSchedule = useMutation(
    orpc.content.updateWorkItem.mutationOptions({ onSettled: onChanged }),
  );
  const atDate = at ? new Date(at) : undefined;

  const mark = (d: Date) =>
    setSchedule.mutate({
      contentPostId,
      platformDrafts: [
        {
          platformPostId: spotId,
          status: "scheduled",
          // Local noon, same convention as the calendar drag-drop.
          scheduledAt: new Date(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
            12,
          ).toISOString(),
        },
      ],
    });

  const chip = cn(
    "flex items-center border py-0.5 text-[11px] font-medium transition-colors",
    scheduled
      ? "border-sky-500/40 text-sky-400"
      : "border-border text-muted-foreground hover:bg-accent",
  );

  return (
    <span className="flex shrink-0 items-center">
      <button
        onClick={() => {
          // Already scheduled or no planned day → adjust via the picker.
          if (scheduled || !atDate) setPickOpen(true);
          else mark(atDate);
        }}
        disabled={setSchedule.isPending}
        title={
          scheduled
            ? "Scheduled — click to change the queue date"
            : "Mark scheduled for its planned day"
        }
        className={cn(chip, "gap-1 rounded-l-full border-r-0 pr-1.5 pl-2")}
      >
        <CalendarIcon className="size-3" />
        {scheduled ? "Scheduled" : "Mark scheduled"}
      </button>
      <Popover open={pickOpen} onOpenChange={setPickOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label="Pick the scheduled date"
            className={cn(chip, "rounded-r-full pr-1.5 pl-1")}
          >
            <ChevronDown className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={atDate}
            defaultMonth={atDate}
            onSelect={(d) => {
              if (d) mark(d);
              setPickOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </span>
  );
}
