"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";
import type { RouterOutputs } from "@/trpc/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SimpleSelect } from "@/components/ui/select";
import { ChannelLogo } from "@/components/channel-logos";
import { toast } from "@/components/ui/toast";

type GenRows = RouterOutputs["cadence"]["generateMonthSlots"]["rows"];

/** "Generate slots" — expand the brand's cadence/mix targets (set on
 *  /channels) into a month of empty slot placeholders. Preview first, one
 *  click to create; idempotent top-up, so re-running after target edits only
 *  adds the difference. */
export function GenerateSlotsDialog({
  brands,
  defaultBrandId,
  open,
  onOpenChange,
  onGenerated,
}: {
  brands: { id: string; name: string }[];
  defaultBrandId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: () => void;
}) {
  const trpc = useTRPC();

  const nextMonth = () => {
    const d = new Date();
    const m = d.getMonth() + 2;
    const y = d.getFullYear() + (m > 12 ? 1 : 0);
    return `${y}-${String(((m - 1) % 12) + 1).padStart(2, "0")}`;
  };

  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? "");
  const [month, setMonth] = useState(nextMonth());
  const [preview, setPreview] = useState<GenRows | null>(null);

  const parseMonth = () => {
    const [y, m] = month.split("-").map(Number);
    return { year: y ?? 0, month: m ?? 0 };
  };

  const dryRun = useMutation(
    trpc.cadence.generateMonthSlots.mutationOptions({
      onSuccess: (res) => setPreview(res.rows),
      onError: (e) => toast.error(e.message),
    }),
  );
  const generate = useMutation(
    trpc.cadence.generateMonthSlots.mutationOptions({
      onSuccess: (res) => {
        toast.success(`Created ${res.created} slots for ${month}`);
        setPreview(null);
        onOpenChange(false);
        onGenerated();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const runPreview = () => {
    if (!brandId) return;
    dryRun.mutate({ brandId, ...parseMonth(), dryRun: true });
  };

  const toCreate = preview?.reduce((n, r) => n + r.created, 0) ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (generate.isPending) return;
        if (!o) setPreview(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate month slots</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground -mt-2 text-sm">
          Expands the cadence &amp; mix targets (set on{" "}
          <span className="text-foreground">/channels</span>) into empty
          calendar slots. Idempotent: filled or claimed slots still count, so
          re-running only tops up what&apos;s missing.
        </p>
        <div className="flex items-center gap-2">
          {brands.length > 1 && (
            <SimpleSelect
              value={brandId}
              onValueChange={(v) => {
                setBrandId(v);
                setPreview(null);
              }}
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              size="sm"
              aria-label="Brand"
            />
          )}
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPreview(null);
            }}
            className="border-border bg-background rounded-md border px-2 py-1 text-sm"
            aria-label="Month"
          />
          <button
            onClick={runPreview}
            disabled={dryRun.isPending || !brandId}
            className="border-border hover:bg-accent ml-auto rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50"
          >
            {dryRun.isPending ? "Previewing…" : "Preview"}
          </button>
        </div>

        {preview && (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground bg-muted/30 text-left">
                  <th className="px-2 py-1.5 font-medium">Channel · format</th>
                  <th className="px-2 py-1.5 text-right font-medium">Target</th>
                  <th className="px-2 py-1.5 text-right font-medium">Existing</th>
                  <th className="px-2 py-1.5 text-right font-medium">New</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={`${r.platform}|${r.archetype}`} className="border-t">
                    <td className="flex items-center gap-1.5 px-2 py-1">
                      <ChannelLogo platform={r.platform} className="size-3.5" />
                      {r.archetype}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.target}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.existing}</td>
                    <td
                      className={
                        r.created > 0
                          ? "px-2 py-1 text-right font-semibold tabular-nums text-emerald-400"
                          : "text-muted-foreground px-2 py-1 text-right tabular-nums"
                      }
                    >
                      +{r.created}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            disabled={generate.isPending}
            className="border-border hover:bg-accent rounded-full border px-4 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => generate.mutate({ brandId, ...parseMonth() })}
            disabled={!preview || toCreate === 0 || generate.isPending}
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {generate.isPending
              ? "Creating…"
              : preview
                ? `Create ${toCreate} slots`
                : "Preview first"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
