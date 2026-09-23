"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/components/ui/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BrandIdentity } from "@/server/db/brand-schema";
import { orpc } from "@/orpc/client";

const MATCHES_SHOWN = 60;

export type BrandFonts = { heading: string | null; body: string | null };

/** The fonts a brand identity carries; heading falls back to body. */
export function brandFonts(identity: BrandIdentity | null): BrandFonts {
  const fonts = identity?.fonts ?? [];
  const body =
    fonts.find((font) => font.role === "body")?.family ??
    fonts[0]?.family ??
    null;
  return {
    heading: fonts.find((font) => font.role === "heading")?.family ?? body,
    body,
  };
}

/** Heading and body pickers over the Google Fonts catalog. Controlled. */
export function BrandFontPicker({
  value,
  disabled,
  onChange,
}: {
  value: BrandFonts;
  disabled: boolean;
  onChange: (next: BrandFonts) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FontField
        label="Heading"
        value={value.heading}
        disabled={disabled}
        onChange={(family) => onChange({ ...value, heading: family })}
      />
      <FontField
        label="Body"
        value={value.body}
        disabled={disabled}
        onChange={(family) => onChange({ ...value, body: family })}
      />
    </div>
  );
}

function FontField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  onChange: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const catalog = useQuery({
    ...orpc.brand.fontCatalog.queryOptions(),
    enabled: open,
    staleTime: Infinity,
  });
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = catalog.data ?? [];
    return (
      needle
        ? all.filter((font) => font.family.toLowerCase().includes(needle))
        : all
    ).slice(0, MATCHES_SHOWN);
  }, [catalog.data, search]);

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-8 w-64 justify-between"
          >
            {value ? (
              <FontSample family={value} />
            ) : (
              <span className="text-muted-foreground">House font</span>
            )}
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search Google Fonts"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {catalog.isPending
                  ? "Loading fonts…"
                  : catalog.isError
                    ? "Couldn't load Google Fonts"
                    : "No match"}
              </CommandEmpty>
              {matches.map((font) => (
                <CommandItem
                  key={font.family}
                  value={font.family}
                  onSelect={() => {
                    setOpen(false);
                    setSearch("");
                    if (font.family !== value) onChange(font.family);
                  }}
                >
                  <Check
                    className={cn(
                      "size-3.5",
                      font.family === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <FontSample family={font.family} className="flex-1 text-sm" />
                  <span className="text-[10px] text-muted-foreground">
                    {font.category}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** A family's name set in itself, loading only the glyphs the name needs. */
function FontSample({
  family,
  className,
}: {
  family: string;
  className?: string;
}) {
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&text=${encodeURIComponent(family)}&display=swap`;
  return (
    <>
      {/* React 19 hoists and dedupes stylesheet links by href. */}
      <link rel="stylesheet" href={href} precedence="brand-font-preview" />
      <span
        className={cn("truncate", className)}
        style={{ fontFamily: `"${family}", var(--font-sans)` }}
      >
        {family}
      </span>
    </>
  );
}
