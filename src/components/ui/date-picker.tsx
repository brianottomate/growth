"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "./lib/utils";

/**
 * Standalone (non-form) date picker — the controlled counterpart to the
 * react-hook-form `DatePickerField`. Built on the same shadcn Calendar + Popover
 * so it matches everywhere. Drop-in replacement for `<input type="date">`:
 * works in `Date | undefined`. For call sites that store a plain `yyyy-mm-dd`
 * string (what the native input emitted), use the `*DateInputValue` helpers.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  align = "start",
  captionLayout = "dropdown",
  disabled,
  clearable = true,
  dateFormat = "MMM d, yyyy",
  id,
  "aria-label": ariaLabel,
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
  captionLayout?: "label" | "dropdown" | "dropdown-months" | "dropdown-years";
  disabled?: boolean;
  clearable?: boolean;
  dateFormat?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          disabled={disabled}
          data-empty={!value}
          className={cn(
            "border-border bg-background hover:bg-accent focus-visible:ring-ring/40 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs outline-none transition-colors focus-visible:ring-2 disabled:opacity-50 data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 opacity-60" />
          <span className="truncate">
            {value ? format(value, dateFormat) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            onChange(d);
            setOpen(false);
          }}
          captionLayout={captionLayout}
        />
        {clearable && value && (
          <div className="border-t p-2">
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="text-muted-foreground hover:text-foreground w-full rounded-md py-1 text-xs"
            >
              Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Date → `yyyy-mm-dd` (LOCAL). For call sites that keep the date as the plain
 *  string `<input type="date">` used. */
export const toDateInputValue = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** `yyyy-mm-dd` → Date at LOCAL noon (keeps the calendar day stable across TZs). */
export const fromDateInputValue = (v: string): Date | undefined =>
  v ? new Date(`${v}T12:00:00`) : undefined;
