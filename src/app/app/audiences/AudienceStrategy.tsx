"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Target, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";
import { AD_PLATFORM_LABELS } from "@/lib/ad-platforms";
import { TargetDialog, type TargetDraft } from "./TargetDialog";

const COVERAGE = {
  covered: { label: "Covered", cls: "text-emerald-300", dot: "bg-emerald-400" },
  partial: { label: "Partial", cls: "text-amber-300", dot: "bg-amber-400" },
  gap: { label: "Gap", cls: "text-red-300", dot: "bg-red-400" },
};

const PROFILE_LABEL: Record<string, string> = {
  core: "Core ICP",
  segment: "Segment",
  experimental: "Experimental",
};

const PRIORITY_LABEL: Record<string, string> = {
  must_have: "Must have",
  should_have: "Should have",
  nice_to_have: "Nice to have",
};

const COVERAGE_ORDER = ["gap", "partial", "covered"];
const PRIORITY_ORDER = ["must_have", "should_have", "nice_to_have"];

export function AudienceStrategy({
  brands,
}: {
  brands: { id: string; name: string }[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(trpc.audience.overview.queryOptions());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TargetDraft | undefined>();

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.audience.overview.queryOptions());

  const link = useMutation(
    trpc.audience.linkAudience.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message || "Failed to link"),
    }),
  );
  const remove = useMutation(
    trpc.audience.deleteTarget.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message || "Failed to delete"),
    }),
  );

  if (isLoading) {
    return <p className="text-muted-foreground mt-8 text-sm">Loading…</p>;
  }

  const targets = [...(data?.targets ?? [])].sort((a, b) => {
    const c =
      COVERAGE_ORDER.indexOf(a.coverage) - COVERAGE_ORDER.indexOf(b.coverage);
    if (c !== 0) return c;
    return (
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    );
  });
  const unmapped = data?.unmapped ?? [];
  const gaps = targets.filter((t) => t.coverage !== "covered").length;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audiences</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Who we <em>want</em> to reach vs. which platform audiences exist.{" "}
            {gaps > 0 && (
              <span className="text-amber-300">{gaps} not fully covered</span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined);
            setDialogOpen(true);
          }}
          disabled={brands.length === 0}
        >
          <Plus className="size-4" />
          New target
        </Button>
      </div>

      {targets.length === 0 && (
        <div className="text-muted-foreground mt-10 rounded-xl border border-dashed p-8 text-center text-sm">
          No audience targets yet. Define who you want to reach, then link the
          per-platform audiences that fulfil each one.
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {targets.map((t) => {
          const cov = COVERAGE[t.coverage] ?? COVERAGE.gap;
          return (
            <div key={t.id} className="bg-card rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    <span className="border-border text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                      {PROFILE_LABEL[t.profileScope] ?? t.profileScope}
                    </span>
                    <span className="text-muted-foreground text-[10px] capitalize">
                      {t.marketSide}
                    </span>
                    <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                      {PRIORITY_LABEL[t.priority] ?? t.priority}
                    </span>
                    <span
                      className={`flex items-center gap-1 text-[11px] font-medium ${cov.cls}`}
                    >
                      <span className={`size-1.5 rounded-full ${cov.dot}`} />
                      {cov.label}
                    </span>
                  </div>
                  {t.description && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {t.description}
                    </p>
                  )}
                  <div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    <span>
                      {t.geography == null
                        ? "Geography not established"
                        : t.geography.mode === "global"
                          ? "Global"
                          : t.geography.include
                              .map((place) => place.name)
                              .join(", ")}
                    </span>
                    {t.demographics?.ageRange && (
                      <span>
                        Age {t.demographics.ageRange.min ?? "any"}–
                        {t.demographics.ageRange.max ?? "any"}
                      </span>
                    )}
                    {(t.demographics?.languages?.length ?? 0) > 0 && (
                      <span>{t.demographics?.languages?.join(", ")}</span>
                    )}
                    <span className="capitalize">
                      {t.researchMaturity.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                    {t.sizeGoalLabel && <span>goal {t.sizeGoalLabel}</span>}
                    {(t.intendedChannels ?? []).map((c) => {
                      const missing = t.missingChannels.includes(c);
                      return (
                        <span
                          key={c}
                          className={
                            missing ? "text-red-300" : "text-emerald-300"
                          }
                        >
                          {missing ? "○" : "●"} {AD_PLATFORM_LABELS[c] ?? c}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => {
                      setEditing({
                        id: t.id,
                        brandId: t.brandId,
                        name: t.name,
                        description: t.description,
                        profileScope: t.profileScope,
                        marketSide: t.marketSide,
                        researchMaturity: t.researchMaturity,
                        status: t.status,
                        priority: t.priority,
                        intendedChannels: t.intendedChannels,
                        sizeGoalLabel: t.sizeGoalLabel,
                        geography: t.geography,
                        demographics: t.demographics,
                        context: t.context,
                      });
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => {
                      if (confirm(`Delete target "${t.name}"?`)) {
                        remove.mutate({ id: t.id });
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 border-t pt-3">
                {t.audiences.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No platform audience linked yet.
                  </p>
                ) : (
                  t.audiences.map((a) => (
                    <div
                      key={a.id}
                      className="bg-background/50 flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
                    >
                      <span className="truncate text-xs">{a.name}</span>
                      <span className="text-muted-foreground text-[10px]">
                        {AD_PLATFORM_LABELS[a.channel?.platform ?? ""] ??
                          a.channel?.platform}
                        {a.sizeLabel ? ` · ${a.sizeLabel}` : ""}
                      </span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground ml-auto"
                        title="Unlink"
                        onClick={() =>
                          link.mutate({ audienceId: a.id, targetId: null })
                        }
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))
                )}

                {unmapped.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(audienceId) =>
                      link.mutate({ audienceId, targetId: t.id })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="+ Link a platform audience" />
                    </SelectTrigger>
                    <SelectContent>
                      {unmapped.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ·{" "}
                          {AD_PLATFORM_LABELS[a.channel?.platform ?? ""] ??
                            a.channel?.platform}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {unmapped.length > 0 && (
        <section className="mt-10">
          <h2 className="text-muted-foreground mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <Target className="size-3.5" />
            Unmapped · {unmapped.length}
          </h2>
          <p className="text-muted-foreground mb-3 text-xs">
            Platform audiences not tied to any target.
          </p>
          <div className="flex flex-col gap-1.5">
            {unmapped.map((a) => (
              <div
                key={a.id}
                className="bg-card flex items-center gap-2 rounded-lg border px-3 py-2"
              >
                <span className="truncate text-sm">{a.name}</span>
                <span className="text-muted-foreground text-[10px]">
                  {AD_PLATFORM_LABELS[a.channel?.platform ?? ""] ??
                    a.channel?.platform}
                </span>
                {targets.length > 0 && (
                  <div className="ml-auto w-52">
                    <Select
                      value=""
                      onValueChange={(targetId) =>
                        link.mutate({ audienceId: a.id, targetId })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Map to target →" />
                      </SelectTrigger>
                      <SelectContent>
                        {targets.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <TargetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        brands={brands}
        initial={editing}
      />
    </div>
  );
}
