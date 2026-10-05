"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { RunActivity } from "@/components/workflow-activity";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { workflowActive, type WorkflowActivityRun } from "@/lib/workflow-run";

export function WorkflowActivity({ brandId }: { brandId: string }) {
  const client = useQueryClient();
  const router = useRouter();
  const options = orpc.workflow.activity.queryOptions({ input: { brandId } });
  const query = useQuery({
    ...options,
    refetchInterval: (q) =>
      q.state.data?.some((run) => workflowActive(run.status)) ? 2000 : 15000,
    refetchIntervalInBackground: false,
  });
  const seen = useRef(new Map<string, WorkflowActivityRun>());
  const dismiss = useMutation(
    orpc.workflow.dismiss.mutationOptions({
      onSuccess: () =>
        void client.invalidateQueries({ queryKey: options.queryKey }),
      onError: (error) => toast.error(error.message),
    }),
  );
  useEffect(() => {
    if (!query.data) return;
    let changed = false;
    for (const run of query.data) {
      const previous = seen.current.get(run.id);
      if (previous && previous.updatedAt !== run.updatedAt) changed = true;
      if (
        previous &&
        workflowActive(previous.status) &&
        !workflowActive(run.status) &&
        !run.parentRunId
      ) {
        if (run.status === "succeeded") toast.success(`${run.title} completed`);
        if (run.status === "failed")
          toast.error(`${run.title} needs attention`);
      }
      seen.current.set(run.id, run);
    }
    if (changed) {
      router.refresh();
      for (const key of [
        orpc.ads.key(),
        orpc.catalog.key(),
        orpc.homeGroups.key(),
        orpc.creativeWork.key(),
      ])
        void client.invalidateQueries({ queryKey: key });
    }
  }, [query.data, router, client]);
  const runs = query.data ?? [];
  const visible = runs.filter(
    (run) =>
      !run.dismissed &&
      (!run.parentRunId ||
        !runs.some(
          (parent) =>
            parent.id === run.parentRunId &&
            (workflowActive(parent.status) || parent.status === "failed"),
        )),
  );
  return (
    <>
      {query.error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border p-4 text-sm"
        >
          Could not load background work.
          <Button
            size="sm"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      )}
      <RunActivity
        runs={visible}
        onOpen={(_, id) => {
          const run = runs.find((r) => r.id === id);
          if (run) router.push(run.href);
        }}
        onContinue={() => undefined}
        onDismiss={(runId) => dismiss.mutate({ brandId, runId })}
      />
    </>
  );
}
