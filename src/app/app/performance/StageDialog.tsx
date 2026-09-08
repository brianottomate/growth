"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  AUTO_STAGES,
  PERFORMANCE_STAGES,
  STAGE_LABEL,
  type PerformanceStage,
} from "@/lib/performance-stage";
import { useTRPC } from "@/trpc/react";

/** Set a brand's stage by hand: any stage, the tabs follow. */
export function StageDialog({
  brandId,
  brandName,
  stage,
  open,
  onOpenChange,
}: {
  brandId: string;
  brandName: string;
  stage: PerformanceStage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [picked, setPicked] = useState<PerformanceStage>(stage);
  const save = useMutation(
    trpc.performance.setStage.mutationOptions({
      onSuccess: () => {
        toast.success(`${brandName}: ${STAGE_LABEL[picked]}`);
        onOpenChange(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Stage for {brandName}</DialogTitle>
        </DialogHeader>
        <div role="radiogroup" className="grid gap-1">
          {PERFORMANCE_STAGES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={picked === option}
              onClick={() => setPicked(option)}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm",
                picked === option ? "border-foreground" : "border-border/70 hover:bg-muted/50",
              )}
            >
              <span>{STAGE_LABEL[option]}</span>
              {AUTO_STAGES.includes(option) ? (
                <span className="text-muted-foreground text-[10px] uppercase tracking-wide">auto</span>
              ) : null}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={save.isPending || picked === stage} onClick={() => save.mutate({ brandId, stage: picked })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
