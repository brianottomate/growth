"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

const money = (dollars: number | null) =>
  dollars == null ? "Not set" : `$${dollars.toLocaleString()}/mo`;

/** Verify the client's ad access, and apply the intake after reading what it writes. */
export function IntakeActions({
  intakeId,
  verified,
}: {
  intakeId: string;
  verified: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState("");

  const verify = useMutation(
    orpc.performance.verifyIntakeAccess.mutationOptions({
      onSuccess: (result) => {
        if (result.matched)
          toast.success(`Access verified: ${result.matched.name ?? "Page"}`);
        else
          toast.error(
            result.candidates.length
              ? `No single Page matches ${result.brandName}: ${result.candidates
                  .map((c) => c.name ?? c.id)
                  .join(", ")}`
              : (result.errors[0] ?? "No Page shared with Wander yet"),
          );
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const preview = useQuery({
    ...orpc.performance.previewIntakeApply.queryOptions({
      input: { intakeId },
    }),
    enabled: open,
  });
  const apply = useMutation(
    orpc.performance.applyIntake.mutationOptions({
      onSuccess: () => {
        toast.success("Intake applied");
        setOpen(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const data = preview.data;
  const typedBudget = budget.trim() === "" ? null : Number(budget);
  const budgetMissing =
    data?.needsBudgetDecision &&
    (typedBudget === null || !Number.isFinite(typedBudget));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!verified && (
        <Button
          size="sm"
          variant="outline"
          loading={verify.isPending}
          onClick={() => verify.mutate({ intakeId })}
        >
          <ShieldCheck className="size-3.5" />
          Verify access
        </Button>
      )}
      <SimpleDialog
        title="Apply intake"
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setBudget("");
        }}
        trigger={<Button size="sm">Apply…</Button>}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={apply.isPending}
              disabled={
                !data || data.blockers.length > 0 || Boolean(budgetMissing)
              }
              onClick={() =>
                apply.mutate({
                  intakeId,
                  ...(data?.needsBudgetDecision
                    ? { mediaBudgetDollars: Math.round(typedBudget ?? 0) }
                    : {}),
                })
              }
            >
              Apply
            </Button>
          </div>
        }
      >
        {preview.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : preview.error ? (
          <p className="text-sm text-destructive">{preview.error.message}</p>
        ) : data ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Period</dt>
            <dd>
              {data.period}
              {data.willCreateCycle ? " · new cycle" : ""}
            </dd>
            <dt className="text-muted-foreground">Media budget</dt>
            <dd>
              {data.needsBudgetDecision ? (
                <span className="flex items-center gap-2">
                  <Label htmlFor="intake-budget" className="sr-only">
                    Monthly media budget
                  </Label>
                  <Input
                    id="intake-budget"
                    inputMode="numeric"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                    placeholder="Monthly, whole dollars"
                    className="h-8 w-44"
                  />
                </span>
              ) : (
                <>
                  {money(data.mediaBudgetDollars)}
                  {data.currentMediaBudget != null &&
                  data.currentMediaBudget !== data.mediaBudgetDollars
                    ? ` (replaces ${money(data.currentMediaBudget)})`
                    : ""}
                </>
              )}
            </dd>
            <dt className="text-muted-foreground">New homes</dt>
            <dd>
              {data.newProperties.length === 0
                ? "None"
                : data.newProperties
                    .map((home) => home.title ?? home.siteUrl)
                    .join(", ")}
            </dd>
            {data.blockers.length > 0 && (
              <>
                <dt className="text-destructive">Blocked</dt>
                <dd className="text-destructive">{data.blockers.join(" ")}</dd>
              </>
            )}
          </dl>
        ) : null}
      </SimpleDialog>
    </div>
  );
}
