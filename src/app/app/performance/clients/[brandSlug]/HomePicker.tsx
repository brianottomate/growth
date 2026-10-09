"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";

/** The least a tile needs to be picked. */
export type PickableHome = {
  id: string;
  name: string;
  imageUrl: string;
  thumbUrl: string | null;
  bedrooms?: number | null;
  guests?: number | null;
  nightlyFrom?: number | null;
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * Choosing which homes a set runs on, behind a button.
 *
 * The set is usually a handful, and it is chosen once and then left alone, so
 * a permanent grid of two hundred tiles was a lot of page to carry a rare
 * act. The chips beside this button are the set; this is only how it changes.
 */
export function HomePicker({
  homes,
  picked,
  max,
  onChange,
  label = "Add homes",
  title = "Homes for the ads",
  single = false,
}: {
  homes: PickableHome[];
  picked: string[];
  max: number;
  onChange: (next: string[]) => void;
  label?: string;
  title?: string;
  /** One home at a time: picking another replaces it, and picking closes. */
  single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return homes;
    return homes.filter((home) => home.name.toLowerCase().includes(q));
  }, [homes, query]);

  const toggle = (id: string) => {
    if (single) {
      onChange(picked.includes(id) ? [] : [id]);
      setOpen(false);
      return;
    }
    if (picked.includes(id)) {
      return onChange(picked.filter((key) => key !== id));
    }
    if (picked.length >= max) return;
    onChange([...picked, id]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        size={single ? "lg" : "default"}
        className="flex max-h-[85vh] w-[96vw] max-w-4xl flex-col overflow-hidden p-0"
      >
        <DialogHeader
          divider="default"
          className="shrink-0 px-5 py-3 pr-12 text-left"
        >
          <DialogTitle className="text-sm">
            {title}
            {single ? "" : ` · ${picked.length}/${max}`}
          </DialogTitle>
        </DialogHeader>
        <div className="shrink-0 px-5 pt-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${homes.length} homes`}
              className="h-8 w-full rounded-full border bg-muted/40 pr-3 pl-8 text-xs outline-none focus:ring-2 focus:ring-sky-400/40"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No home matches “{query}”.
            </p>
          ) : (
            <ul
              className={
                single
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3"
                  : "grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
              }
            >
              {filtered.map((home) => {
                const on = picked.includes(home.id);
                const full = !single && !on && picked.length >= max;
                return (
                  <li key={home.id}>
                    <button
                      type="button"
                      onClick={() => toggle(home.id)}
                      disabled={full}
                      title={
                        full
                          ? `${max} homes is the most one set holds`
                          : on
                            ? "Take out of the set"
                            : "Add to the set"
                      }
                      className={cn(
                        "group relative block w-full overflow-hidden rounded-xl border text-left transition",
                        on
                          ? "border-sky-400 ring-2 ring-sky-400/40"
                          : "hover:border-white/30",
                        full && "opacity-40",
                      )}
                    >
                      {/* oxlint-disable-next-line nextjs/no-img-element */}
                      <img
                        src={home.thumbUrl ?? home.imageUrl}
                        alt={home.name}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <span
                        className={cn(
                          "absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full border text-white",
                          on
                            ? "border-sky-400 bg-sky-500"
                            : "border-white/60 bg-black/40 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100",
                        )}
                      >
                        {on ? <Check className="size-3" /> : null}
                      </span>
                      <span className="block px-2 py-1.5">
                        <span className="block truncate text-[11.5px] font-medium">
                          {home.name}
                        </span>
                        <span className="block truncate text-[10.5px] text-muted-foreground">
                          {[
                            home.bedrooms ? `${home.bedrooms} bd` : null,
                            home.guests ? `${home.guests} guests` : null,
                            home.nightlyFrom
                              ? `${money(home.nightlyFrom)}/nt`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3">
          <span className="text-[11.5px] text-muted-foreground">
            {single
              ? picked.length
                ? "1 chosen"
                : "None chosen"
              : `${picked.length}/${max} chosen`}
          </span>
          <Button
            size="sm"
            shape="round"
            density="editorial"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
