"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2, Plus } from "lucide-react";

import type { DigestProperty } from "@/lib/listings-digest";
import { orpc } from "@/orpc/client";

/**
 * The brand's own homes to pick from, for one group of cards. Order of
 * picking is the order in the email.
 */
export function BrandHomePicker({
  brandId,
  campaign,
  onAdd,
}: {
  brandId: string;
  campaign: string;
  onAdd: (homes: DigestProperty[]) => void;
}) {
  const homes = useQuery(
    orpc.newsletter.brandHomes.queryOptions({ input: { brandId } }),
  );
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const shown = (homes.data ?? []).filter(
    (home) =>
      !needle ||
      picked.includes(home.id) ||
      [home.name, home.city].some((value) =>
        value?.toLowerCase().includes(needle),
      ),
  );
  const build = useMutation(
    orpc.newsletter.digestSectionFromBrandHomes.mutationOptions({
      onSuccess: (section) => {
        onAdd(section.properties);
        setPicked([]);
      },
    }),
  );

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );

  return (
    <div>
      <div className="mb-2 flex gap-1.5">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${homes.data?.length ?? ""} homes`}
          aria-label="Search homes"
          className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs"
        />
        <button
          type="button"
          disabled={!picked.length || build.isPending}
          onClick={() =>
            build.mutate({ brandId, homeIds: picked, heading: "", campaign })
          }
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {build.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          {picked.length === 0
            ? "Add homes"
            : `Add ${picked.length} ${picked.length === 1 ? "home" : "homes"}`}
        </button>
      </div>
      {homes.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid max-h-80 grid-cols-2 gap-2 overflow-auto @xl:grid-cols-3">
          {shown.map((home) => {
            const position = picked.indexOf(home.id);
            return (
              <button
                key={home.id}
                type="button"
                onClick={() => toggle(home.id)}
                className={`relative overflow-hidden rounded-lg border text-left transition-colors ${
                  position >= 0 ? "border-primary ring-2 ring-primary" : ""
                }`}
              >
                {home.heroUrl ? (
                  // oxlint-disable-next-line nextjs/no-img-element
                  <img
                    src={home.heroUrl}
                    alt=""
                    className="aspect-[3/2] w-full object-cover"
                  />
                ) : (
                  <div className="aspect-[3/2] w-full bg-muted" />
                )}
                {position >= 0 && (
                  <span className="absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {position === 0 ? (
                      <Check className="size-3" />
                    ) : (
                      position + 1
                    )}
                  </span>
                )}
                <div className="p-1.5">
                  <div className="truncate text-[11px] font-medium">
                    {home.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {[
                      home.guests ? `Sleeps ${home.guests}` : null,
                      home.nightlyFrom ? `from $${home.nightlyFrom}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {build.error && (
        <p className="mt-2 text-xs text-destructive">{build.error.message}</p>
      )}
    </div>
  );
}
