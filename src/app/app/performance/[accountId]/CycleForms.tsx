"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/trpc/react";

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [["performance"]] });
};

/** Sponsored homes are entered by wander.com URL; the monolith property id is
 *  backfilled separately, so it is not asked for here. */
export function AddPropertyForm({ accountId }: { accountId: string }) {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const add = useMutation(
    trpc.performance.addProperty.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setUrl("");
        setTitle("");
        setOpen(false);
      },
    }),
  );

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add a home
      </Button>
    );
  }

  return (
    <div className="border-border bg-surface-secondary/30 space-y-2 rounded-md border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="prop-url" className="text-xs">
            wander.com URL
          </Label>
          <Input
            id="prop-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.wander.com/property/…"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="prop-title" className="text-xs">
            Display name
          </Label>
          <Input
            id="prop-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Wander Pawleys Island"
            className="h-8 text-xs"
          />
        </div>
      </div>
      {add.error && <p className="text-xs text-red-300">{add.error.message}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!url.trim() || add.isPending}
          onClick={() =>
            add.mutate({
              accountId,
              wanderUrl: url.trim(),
              title: title.trim() || null,
              propertyId: null,
              notes: null,
            })
          }
        >
          {add.isPending ? "Adding…" : "Add"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Billed and media are asked for separately and both are required in practice:
 * the gap between them is the take rate, and a cycle that only knows what the
 * customer paid will overspend the media plan by exactly that margin.
 */
export function OpenCycleForm({ accountId }: { accountId: string }) {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [billed, setBilled] = useState("");
  const [media, setMedia] = useState("");

  const openCycle = useMutation(
    trpc.performance.openCycle.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setBilled("");
        setMedia("");
        setOpen(false);
      },
    }),
  );

  const billedNum = Number(billed);
  const mediaNum = Number(media);
  const mediaExceedsBilled =
    billed !== "" && media !== "" && mediaNum > billedNum;

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Open a cycle
      </Button>
    );
  }

  return (
    <div className="border-border bg-surface-secondary/30 space-y-2 rounded-md border p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="cycle-period" className="text-xs">
            Period
          </Label>
          <Input
            id="cycle-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            placeholder="2026-09"
            className="h-8 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cycle-billed" className="text-xs">
            Billed ($/mo)
          </Label>
          <Input
            id="cycle-billed"
            type="number"
            value={billed}
            onChange={(event) => setBilled(event.target.value)}
            placeholder="500"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cycle-media" className="text-xs">
            Media ($/mo)
          </Label>
          <Input
            id="cycle-media"
            type="number"
            value={media}
            onChange={(event) => setMedia(event.target.value)}
            placeholder="400"
            className="h-8 text-xs"
          />
        </div>
      </div>
      {mediaExceedsBilled && (
        <p className="text-xs text-amber-300">
          Media budget is above what the customer is billed — that runs the
          cycle at a loss. Intentional?
        </p>
      )}
      {media !== "" && mediaNum > 0 && (
        <p className="text-muted-foreground text-xs">
          ≈${(mediaNum / 30).toFixed(2)}/day across a 30-day month.
        </p>
      )}
      {openCycle.error && (
        <p className="text-xs text-red-300">{openCycle.error.message}</p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!period.trim() || openCycle.isPending}
          onClick={() =>
            openCycle.mutate({
              accountId,
              period: period.trim(),
              billedAmount: billed === "" ? null : Math.round(billedNum),
              mediaBudget: media === "" ? null : Math.round(mediaNum),
              startAt: null,
              endAt: null,
              notes: null,
            })
          }
        >
          {openCycle.isPending ? "Opening…" : "Open"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const CYCLE_STATUSES = ["planned", "live", "reporting", "closed"] as const;

/** Status is the only cycle field edited often enough to deserve one click. */
export function CycleStatusPicker({
  cycleId,
  status,
}: {
  cycleId: string;
  status: string;
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const update = useMutation(
    trpc.performance.updateCycle.mutationOptions({ onSuccess: invalidate }),
  );

  return (
    <select
      value={status}
      disabled={update.isPending}
      onChange={(event) =>
        update.mutate({
          cycleId,
          status: event.target
            .value as (typeof CYCLE_STATUSES)[number],
        })
      }
      className="border-input bg-background text-muted-foreground h-6 rounded border px-1.5 text-xs"
    >
      {CYCLE_STATUSES.map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </select>
  );
}
