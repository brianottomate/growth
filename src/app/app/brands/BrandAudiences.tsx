"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";
import { TargetDialog, type TargetDraft } from "../audiences/TargetDialog";

const COVERAGE = {
  covered: { label: "Covered", cls: "text-emerald-300", dot: "bg-emerald-400" },
  partial: { label: "Partial", cls: "text-amber-300", dot: "bg-amber-400" },
  gap: { label: "Gap", cls: "text-red-300", dot: "bg-red-400" },
} as const;

const TYPE_LABEL: Record<string, string> = {
  segment: "Segment",
  keyword: "Keyword",
  intent: "Intent",
  lookalike: "Lookalike",
  custom: "Custom",
};

// Short labels for the inline per-channel coverage dots.
const PLATFORM_SHORT: Record<string, string> = {
  google_ads: "Google",
  meta_ads: "Meta",
  openai_ads: "OpenAI",
};

const COVERAGE_ORDER = ["gap", "partial", "covered"];
const PRIORITY_ORDER = ["must_have", "should_have", "nice_to_have"];

/**
 * Per-brand audiences zone for the brand card. Reuses the cross-brand
 * `audience.overview` query (React Query dedupes across cards) and filters to
 * this brand. Quick glance + create/edit here; full platform-audience linking
 * and unmapped reconciliation live on the standalone /audiences page.
 */
export function BrandAudiences({
  brandId,
  brandName,
}: {
  brandId: string;
  brandName: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useQuery(trpc.audience.overview.queryOptions());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TargetDraft | undefined>();

  const remove = useMutation(
    trpc.audience.deleteTarget.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.audience.overview.queryOptions()),
      onError: (e) => toast.error(e.message || "Failed to delete"),
    }),
  );

  const targets = (data?.targets ?? [])
    .filter((t) => t.brandId === brandId)
    .sort((a, b) => {
      const c =
        COVERAGE_ORDER.indexOf(a.coverage) - COVERAGE_ORDER.indexOf(b.coverage);
      if (c !== 0) return c;
      return (
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
      );
    });

  return (
    <div className="mt-3 border-t pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
          Audiences{targets.length > 0 && ` · ${targets.length}`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-1.5"
          onClick={() => {
            setEditing(undefined);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-3.5" />
          Target
        </Button>
      </div>

      {targets.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">
          No audience targets yet. Define who you want to reach, then link
          per-platform audiences on the Audiences page.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {targets.map((t) => {
            const cov = COVERAGE[t.coverage] ?? COVERAGE.gap;
            return (
              <div
                key={t.id}
                className="hover:bg-accent group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors"
              >
                <span className={`size-1.5 shrink-0 rounded-full ${cov.dot}`} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{t.name}</span>
                    <span className="border-border text-muted-foreground rounded-full border px-1.5 py-px text-[10px]">
                      {TYPE_LABEL[t.type] ?? t.type}
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                    <span className={cov.cls}>{cov.label}</span>
                    {(t.intendedChannels ?? []).map((c) => {
                      const missing = t.missingChannels.includes(c);
                      return (
                        <span
                          key={c}
                          className={
                            missing ? "text-red-300/80" : "text-emerald-300/90"
                          }
                        >
                          {missing ? "○" : "●"} {PLATFORM_SHORT[c] ?? c}
                        </span>
                      );
                    })}
                    {t.audiences.length > 0 && (
                      <span className="text-muted-foreground">
                        {t.audiences.length} linked
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    title="Edit target"
                    onClick={() => {
                      setEditing({
                        id: t.id,
                        brandId: t.brandId,
                        name: t.name,
                        description: t.description,
                        type: t.type,
                        status: t.status,
                        priority: t.priority,
                        intendedChannels: t.intendedChannels,
                        sizeGoalLabel: t.sizeGoalLabel,
                      });
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive size-7"
                    title="Delete target"
                    onClick={() => {
                      if (confirm(`Delete target "${t.name}"?`)) {
                        remove.mutate({ id: t.id });
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <TargetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        brands={[{ id: brandId, name: brandName }]}
        initial={editing}
      />
    </div>
  );
}
