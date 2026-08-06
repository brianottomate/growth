"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";
import { cn } from "@/components/ui/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

/** "Import plan" — paste the team's Claude monthly-workbook export, get a
 *  reviewable set of slot-fill suggestions. The kill-the-transcription step:
 *  the girls keep planning in Claude; this replaces the copy-into-the-sheet. */
export function ImportPlanDialog({
  brands,
  defaultBrandId,
  open,
  onOpenChange,
}: {
  brands: { id: string; name: string }[];
  defaultBrandId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();

  const nextMonth = () => {
    const d = new Date();
    const m = d.getMonth() + 2; // JS month +1 for next, +1 for 1-based
    const y = d.getFullYear() + (m > 12 ? 1 : 0);
    return `${y}-${String(((m - 1) % 12) + 1).padStart(2, "0")}`;
  };

  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? "");
  const [month, setMonth] = useState(nextMonth());
  const [rawText, setRawText] = useState("");

  // Recent imports — the way back into a review you closed (e.g. one with
  // pending decisions).
  const { data: recent = [] } = useQuery({
    ...trpc.planImport.list.queryOptions({}),
    enabled: open,
  });

  const create = useMutation(
    trpc.planImport.createFromPaste.mutationOptions({
      onSuccess: ({ importId, itemCount, fillCount }) => {
        toast.success(
          `Parsed ${itemCount} ideas (${fillCount} match open slots)`,
        );
        onOpenChange(false);
        router.push(`/app/content/import/${importId}`);
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const submit = () => {
    if (!brandId || rawText.trim().length < 50) return;
    create.mutate({ brandId, rawText, month, source: "claude-export" });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !create.isPending && onOpenChange(o)}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a month plan</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground -mt-2 text-sm">
          Paste the workbook export (straight from the spreadsheet — tabs and
          all). We parse it, cluster rows into ideas, and propose how they fill
          the month&apos;s open slots. Nothing is written until you review.
        </p>
        <div className="flex items-center gap-2">
          {brands.length > 1 && (
            <SimpleSelect
              value={brandId}
              onValueChange={setBrandId}
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              size="sm"
              aria-label="Brand"
            />
          )}
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border-border bg-background rounded-md border px-2 py-1 text-sm"
            aria-label="Plan month"
          />
        </div>
        <Textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste the month workbook here…"
          className="h-64 font-mono text-xs"
        />
        {recent.length > 0 && (
          <div className="rounded-lg border">
            <p className="text-muted-foreground border-b px-3 py-1.5 text-[11px] font-medium">
              Recent imports
            </p>
            {recent.slice(0, 4).map((imp) => (
              <Link
                key={imp.id}
                href={`/app/content/import/${imp.id}`}
                onClick={() => onOpenChange(false)}
                className="hover:bg-accent/40 flex items-center gap-2 border-b px-3 py-1.5 text-xs last:border-b-0"
              >
                <span className="font-medium">{imp.month}</span>
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[10px]",
                    imp.status === "applied"
                      ? "border-emerald-500/40 text-emerald-400"
                      : imp.status === "failed"
                        ? "border-rose-500/40 text-rose-400"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {imp.status}
                </span>
                <span className="text-muted-foreground">
                  {imp.itemCount} ideas
                  {imp.tally.pending > 0 && (
                    <span className="text-amber-400">
                      {" "}
                      · {imp.tally.pending} pending review
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground/60 ml-auto tabular-nums">
                  {new Date(imp.createdAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </Link>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <span className="text-muted-foreground mr-auto text-xs">
            {rawText.length ? `${rawText.length.toLocaleString()} chars` : ""}
          </span>
          <button
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
            className="border-border hover:bg-accent rounded-full border px-4 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={
              create.isPending || rawText.trim().length < 50 || !brandId
            }
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {create.isPending
              ? "Parsing… (can take a minute)"
              : "Parse & review"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
