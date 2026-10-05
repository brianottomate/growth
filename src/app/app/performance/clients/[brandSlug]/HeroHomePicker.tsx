"use client";

import { useMemo, useState } from "react";
import { useWorkspaceMutation } from "./useWorkspaceMutation";
import { Check, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

export type HeroOption = {
  name: string;
  url: string;
  imageUrl: string;
  thumbUrl: string | null;
};

/** Choose the brand's hero home; the previews draw from it and its photo. */
export function HeroHomePicker({
  brandId,
  options,
  featuredUrl,
  label,
  primary = false,
}: {
  brandId: string;
  options: HeroOption[];
  featuredUrl: string | null;
  label: string;
  primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? options.filter((option) => option.name.toLowerCase().includes(q))
      : options;
  }, [options, query]);
  const feature = useWorkspaceMutation(
    orpc.brand.setPreviewSource.mutationOptions({
      onSuccess: () => setOpen(false),
      onError: (error) => toast.error(error.message),
    }),
  );
  if (options.length === 0) return null;

  return (
    <>
      <Button
        size="sm"
        variant={primary ? "default" : "outline"}
        loading={feature.isPending}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!feature.isPending) setOpen(next);
        }}
      >
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>Hero home</DialogTitle>
          </DialogHeader>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Filter ${options.length} homes`}
              className="h-8 w-full max-w-72 rounded-full border bg-muted/40 pr-3 pl-8 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          {shown.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No home matches “{query}”.
            </p>
          ) : null}
          <ul className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-5">
            {shown.map((option) => {
              const selected = option.url === featuredUrl;
              return (
                <li key={option.url}>
                  <button
                    type="button"
                    disabled={feature.isPending}
                    onClick={() => {
                      feature.mutate({
                        id: brandId,
                        listingUrl: option.url,
                        sourceUrl: option.imageUrl,
                      });
                    }}
                    className={cn(
                      "group block w-full space-y-1.5 rounded-lg border p-1.5 text-left text-xs transition hover:border-foreground disabled:cursor-wait disabled:opacity-60",
                      selected && "border-foreground",
                    )}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
                      {/* oxlint-disable-next-line nextjs/no-img-element */}
                      <img
                        src={option.thumbUrl ?? option.imageUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                      {selected ? (
                        <span className="absolute top-1.5 right-1.5 grid size-5 grid-cols-1 place-items-center rounded-full bg-foreground text-background">
                          <Check className="size-3" />
                        </span>
                      ) : null}
                    </div>
                    <span className="block truncate px-0.5">{option.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {feature.isPending && (
            <p role="status" className="text-sm text-muted-foreground">
              Saving preview image…
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
