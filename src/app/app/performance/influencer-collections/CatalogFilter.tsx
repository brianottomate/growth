"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function CatalogFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const matching = options.filter((option) =>
    option.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Filter by ${label.toLowerCase()}`}
        >
          {label}
          {value.length > 0 ? ` (${value.length})` : ""}
          <ChevronDown className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] space-y-3"
      >
        <Input
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder={`Search ${label.toLowerCase()}…`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div
          className="max-h-64 space-y-1 overflow-y-auto"
          role="group"
          aria-label={label}
        >
          {matching.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-accent"
            >
              <Checkbox
                checked={value.includes(option.id)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...value, option.id]
                      : value.filter((id) => id !== option.id),
                  )
                }
              />
              <span className="min-w-0 text-sm break-words">
                {option.label}
              </span>
            </label>
          ))}
          {!matching.length && (
            <p className="p-2 text-sm text-muted-foreground">
              No matching {label.toLowerCase()}.
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!value.length}
          onClick={() => onChange([])}
        >
          Clear {label.toLowerCase()}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
