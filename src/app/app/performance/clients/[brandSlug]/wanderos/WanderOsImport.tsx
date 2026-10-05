"use client";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import { WANDEROS_IMPORT_LABELS } from "@/lib/wanderos-import";
import { useWorkspaceMutation } from "../useWorkspaceMutation";

function useImportRun(brandId: string) {
  return useQuery({
    ...orpc.catalog.wanderOsImportStatus.queryOptions({ input: { brandId } }),
    refetchInterval: (query) =>
      ["queued", "processing"].includes(query.state.data?.run?.status ?? "")
        ? 2000
        : false,
  });
}
const active = (status?: string) =>
  status === "queued" || status === "processing";
export function ImportWanderOsButton({ brandId }: { brandId: string }) {
  const client = useQueryClient();
  const progress = useImportRun(brandId);
  const start = useMutation(
    orpc.catalog.importWanderOs.mutationOptions({
      onSuccess: (result) =>
        client.setQueryData(
          orpc.catalog.wanderOsImportStatus.queryOptions({ input: { brandId } })
            .queryKey,
          { run: result.run },
        ),
      onError: (error) => toast.error(error.message),
    }),
  );
  const busy = start.isPending || active(progress.data?.run?.status);
  return (
    <Button
      size="sm"
      loading={busy}
      disabled={progress.isPending || Boolean(progress.error)}
      onClick={() => start.mutate({ brandId })}
    >
      {busy
        ? "Importing WanderOS…"
        : progress.data?.run?.status === "error"
          ? "Retry import"
          : "Import WanderOS"}
    </Button>
  );
}

export function WanderOsImportProgress({ brandId }: { brandId: string }) {
  const progress = useImportRun(brandId);
  const router = useRouter();
  const client = useQueryClient();
  const seen = useRef("");
  const run = progress.data?.run;
  useEffect(() => {
    if (!run) return;
    const version = `${run.id}:${run.status}:${run.steps.map((step) => step.status).join(":")}`;
    if (seen.current === version) return;
    seen.current = version;
    router.refresh();
    void client.invalidateQueries({ queryKey: orpc.homeGroups.key() });
    void client.invalidateQueries({
      queryKey: orpc.catalog.state.queryOptions({ input: { brandId } })
        .queryKey,
    });
  }, [run, router, client, brandId]);
  if (progress.error)
    return (
      <div role="alert" className="space-y-2 rounded-xl border p-4 text-sm">
        <p>Could not read import progress: {progress.error.message}</p>
        <Button
          variant="outline"
          size="sm"
          loading={progress.isFetching}
          onClick={() => void progress.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  if (!run || run.status === "ready") return null;
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p role="status" className="text-sm font-medium">
        {run.status === "error"
          ? "WanderOS import needs attention"
          : run.steps.find((step) => step.step === "catalog")?.status ===
              "processing"
            ? "Preparing catalog"
            : "Setting up WanderOS"}
      </p>
      {active(run.status) &&
        run.steps.find((step) => step.step === "catalog")?.status ===
          "processing" && (
          <p className="text-sm text-muted-foreground">
            Homes, Featured selection, and destinations are ready. Only cards
            without a completed preparation are processed; existing copy is
            kept.
          </p>
        )}
      <ol className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        {run.steps.map((step, index) => (
          <li key={step.step} className="flex items-start gap-2">
            {step.status === "ready" ? (
              <Check className="mt-0.5 size-4" />
            ) : step.status === "processing" ? (
              <Loader2 className="mt-0.5 size-4 animate-spin" />
            ) : (
              <span className="text-muted-foreground">{index + 1}.</span>
            )}
            <div>
              <span>{WANDEROS_IMPORT_LABELS[step.step]}</span>
              {step.message && (
                <p className="text-xs text-muted-foreground">{step.message}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {run.error && (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{run.error}</p>
          <ImportWanderOsButton brandId={brandId} />
        </div>
      )}
    </div>
  );
}

export function WanderOsInventoryActions({
  brandId,
  connected,
}: {
  brandId: string;
  connected: boolean;
}) {
  const progress = useImportRun(brandId);
  const refresh = useWorkspaceMutation(
    orpc.catalog.refreshHomes.mutationOptions({
      onSuccess: () => {
        toast.success("Homes refreshed");
      },
    }),
  );
  const recheck = useWorkspaceMutation(
    orpc.brand.recheckWebsite.mutationOptions(),
  );
  const busy =
    refresh.isPending ||
    recheck.isPending ||
    active(progress.data?.run?.status);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        loading={recheck.isPending}
        disabled={busy}
        onClick={() => recheck.mutate({ brandId })}
      >
        {recheck.isPending ? "Checking WanderOS…" : "Recheck WanderOS"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        loading={refresh.isPending}
        disabled={busy || !connected}
        onClick={() => refresh.mutate({ brandId })}
      >
        {refresh.isPending ? "Refreshing homes…" : "Refresh homes"}
      </Button>
    </>
  );
}
