"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpc } from "@/orpc/client";

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [["performance"]] });
};

/** Sponsored homes are entered by wander.com URL; the monolith property id is
 *  backfilled separately, so it is not asked for here. */
export function AddPropertyForm({ accountId }: { accountId: string }) {
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const add = useMutation(
    orpc.performance.addProperty.mutationOptions({
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
    <div className="space-y-2 rounded-md border border-border bg-surface-secondary/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="prop-url" textSize="xs">
            wander.com URL
          </Label>
          <Input
            id="prop-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.wander.com/property/…"
            textSize="xs"
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="prop-title" textSize="xs">
            Display name
          </Label>
          <Input
            id="prop-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Wander Pawleys Island"
            textSize="xs"
            className="h-8"
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
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [billed, setBilled] = useState("");
  const [media, setMedia] = useState("");

  const openCycle = useMutation(
    orpc.performance.openCycle.mutationOptions({
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
    <div className="space-y-2 rounded-md border border-border bg-surface-secondary/30 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="cycle-period" textSize="xs">
            Period
          </Label>
          <Input
            id="cycle-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            placeholder="2026-09"
            textSize="xs"
            monospace
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cycle-billed" textSize="xs">
            Billed ($/mo)
          </Label>
          <Input
            id="cycle-billed"
            type="number"
            value={billed}
            onChange={(event) => setBilled(event.target.value)}
            placeholder="500"
            textSize="xs"
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cycle-media" textSize="xs">
            Media ($/mo)
          </Label>
          <Input
            id="cycle-media"
            type="number"
            value={media}
            onChange={(event) => setMedia(event.target.value)}
            placeholder="400"
            textSize="xs"
            className="h-8"
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
        <p className="text-xs text-muted-foreground">
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
  const invalidate = useInvalidate();
  const update = useMutation(
    orpc.performance.updateCycle.mutationOptions({ onSuccess: invalidate }),
  );

  return (
    <select
      value={status}
      disabled={update.isPending}
      onChange={(event) =>
        update.mutate({
          cycleId,
          status: event.target.value as (typeof CYCLE_STATUSES)[number],
        })
      }
      className="h-6 rounded border border-input bg-background px-1.5 text-xs text-muted-foreground"
    >
      {CYCLE_STATUSES.map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </select>
  );
}

/**
 * Manual propertyId entry. The value is the listing id — the same one the
 * catalog uses as retailer_id and the tracked events send as
 * products[0].product_id — so filling it is what makes abandonment and
 * booking attribution match this home.
 */
export function PropertyIdField({
  propertyRowId,
  propertyId,
}: {
  propertyRowId: string;
  propertyId: string | null;
}) {
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(propertyId ?? "");

  const update = useMutation(
    orpc.performance.updateProperty.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setEditing(false);
      },
    }),
  );

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="font-mono text-xs hover:underline"
        title="Edit listing id"
      >
        {propertyId ?? <span className="text-amber-300">set property id</span>}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="listing id"
        textSize="xs"
        monospace
        className="h-7 w-56"
      />
      <Button
        size="sm"
        className="h-7"
        disabled={update.isPending}
        onClick={() =>
          update.mutate({
            propertyId: propertyRowId,
            monolithPropertyId: value.trim() || null,
          })
        }
      >
        Save
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7"
        onClick={() => setEditing(false)}
      >
        Cancel
      </Button>
    </div>
  );
}
