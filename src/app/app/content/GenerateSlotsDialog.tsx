"use client";

import { Fragment, useEffect, useState } from "react";
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
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { toast } from "@/components/ui/toast";
import { PILLAR_BY_SLUG } from "@/lib/pillars";

type GenPreview = Pick<
  RouterOutputs["cadence"]["generateMonthSlots"],
  "rows" | "mix"
>;

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
  initialMonth,
}: {
  brands: { id: string; name: string }[];
  defaultBrandId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: () => void;
  /** "YYYY-MM" — preselect a month (e.g. a per-month Generate CTA). */
  initialMonth?: string;
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
  const [preview, setPreview] = useState<GenPreview | null>(null);

  // A per-month CTA re-targets the dialog each time it opens.
  useEffect(() => {
    if (open && initialMonth) {
      setMonth(initialMonth);
      setPreview(null);
    }
  }, [open, initialMonth]);

  const parseMonth = () => {
    const [y, m] = month.split("-").map(Number);
    return { year: y ?? 0, month: m ?? 0 };
  };

  const dryRun = useMutation(
    trpc.cadence.generateMonthSlots.mutationOptions({
      onSuccess: (res) => setPreview({ rows: res.rows, mix: res.mix }),
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

  const toCreate = preview?.rows.reduce((n, r) => n + r.created, 0) ?? 0;

  // Per-channel sections: rows in service order, mix strategy attached.
  const sections = preview
    ? [...new Set(preview.rows.map((r) => r.platform))].map((platform) => ({
        platform,
        rows: preview.rows.filter((r) => r.platform === platform),
        mix: preview.mix.find((m) => m.platform === platform) ?? null,
      }))
    : [];

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
        <p className="-mt-2 text-sm text-muted-foreground">
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
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            aria-label="Month"
          />
        </div>

        {preview && (
          <div className="max-h-96 overflow-y-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="sticky top-0 bg-muted/30 text-left text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Format</th>
                  <th className="px-2 py-1.5 text-right font-medium">Target</th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    Existing
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium">New</th>
                </tr>
              </thead>
              <tbody>
                {sections.map(({ platform, rows, mix }) => (
                  <Fragment key={platform}>
                    {/* channel header: identity + weekly tempo + new-slot subtotal */}
                    <tr className="border-t bg-muted/20">
                      <td colSpan={3} className="px-2 py-1.5">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                          <ChannelLogo
                            platform={platform}
                            className="size-3.5"
                          />
                          {platformLabel(platform)}
                          <span className="font-normal text-muted-foreground/60 tabular-nums">
                            ≈
                            {rows
                              .reduce(
                                (n, r) =>
                                  n +
                                  (r.period === "week"
                                    ? r.count
                                    : r.period === "day"
                                      ? r.count * 7
                                      : r.count / 4.345),
                                0,
                              )
                              .toFixed(1)}
                            /wk
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold text-emerald-400 tabular-nums">
                        +{rows.reduce((n, r) => n + r.created, 0)}
                      </td>
                    </tr>
                    {rows.map((r) => (
                      <tr
                        key={`${r.platform}|${r.archetype}`}
                        className="border-t"
                      >
                        <td className="px-2 py-1 pl-7 text-muted-foreground">
                          {r.archetype}
                          <span className="ml-1.5 text-muted-foreground/50 tabular-nums">
                            {r.count}/
                            {r.period === "week"
                              ? "wk"
                              : r.period === "month"
                                ? "mo"
                                : "day"}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {r.target}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {r.existing}
                        </td>
                        <td
                          className={
                            r.created > 0
                              ? "px-2 py-1 text-right font-semibold text-emerald-400 tabular-nums"
                              : "px-2 py-1 text-right text-muted-foreground tabular-nums"
                          }
                        >
                          +{r.created}
                        </td>
                      </tr>
                    ))}
                    {/* the mix strategy this channel's slots are allocated from */}
                    {mix && (
                      <tr className="border-t">
                        <td colSpan={4} className="px-2 py-1.5 pl-7">
                          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase">
                              Mix{mix.isOverride ? "" : " (brand default)"}
                            </span>
                            {mix.pillars.map((p) => (
                              <span
                                key={p.pillar}
                                className="flex items-center gap-1 text-[11px]"
                              >
                                <span
                                  className="size-2 rounded-full"
                                  style={{
                                    background:
                                      PILLAR_BY_SLUG[p.pillar]?.color ??
                                      "var(--color-muted-foreground)",
                                  }}
                                />
                                <span className="text-muted-foreground">
                                  {PILLAR_BY_SLUG[p.pillar]?.name ?? p.pillar}
                                </span>
                                <span className="text-muted-foreground/70 tabular-nums">
                                  {p.pct}%
                                </span>
                              </span>
                            ))}
                          </span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            disabled={generate.isPending}
            className="rounded-full border border-border px-4 py-1.5 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          {/* One two-step button: dry-run preview → confirm-create. */}
          <button
            onClick={() =>
              preview
                ? generate.mutate({ brandId, ...parseMonth() })
                : runPreview()
            }
            disabled={
              !brandId ||
              dryRun.isPending ||
              generate.isPending ||
              (!!preview && toCreate === 0)
            }
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {generate.isPending
              ? "Creating…"
              : dryRun.isPending
                ? "Previewing…"
                : preview
                  ? toCreate === 0
                    ? "Nothing to create — targets met"
                    : `Create ${toCreate} slots`
                  : "Preview"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
