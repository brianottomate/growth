"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import type { PerformanceReportContent } from "@/lib/performance-report";
import { orpc } from "@/orpc/client";

/** The case study's two settings: whether creative prints, and its lead. */
export function CaseStudyControls({
  brandId,
  draft,
}: {
  brandId: string;
  draft: {
    id: string;
    cycleId: string | null;
    content: PerformanceReportContent;
  };
}) {
  const router = useRouter();
  const save = useMutation(orpc.performance.saveReportDraft.mutationOptions());
  const write = useMutation(
    orpc.performance.writeCaseStudyLead.mutationOptions(),
  );
  const study = draft.content.caseStudy!;
  const busy = save.isPending || write.isPending;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 pr-2">
        <Checkbox
          id="case-study-creative"
          checked={study.showCreative}
          disabled={busy || draft.content.highlights.length === 0}
          onCheckedChange={(value) =>
            void run(() =>
              save.mutateAsync({
                brandId,
                id: draft.id,
                cycleId: draft.cycleId,
                content: {
                  ...draft.content,
                  caseStudy: { ...study, showCreative: value === true },
                },
              }),
            )
          }
        />
        <Label htmlFor="case-study-creative" className="text-sm">
          Show creative
        </Label>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() =>
          void run(() => write.mutateAsync({ brandId, reportId: draft.id }))
        }
      >
        <Sparkles className="size-3.5" />
        {write.isPending ? "Writing…" : "Write the lead"}
      </Button>
    </>
  );
}
