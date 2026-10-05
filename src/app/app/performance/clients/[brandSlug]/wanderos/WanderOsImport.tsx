"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import { useWorkspaceMutation } from "../useWorkspaceMutation";

function useImportRun(brandId: string) {
  return useQuery({
    ...orpc.catalog.wanderOsImportStatus.queryOptions({ input: { brandId } }),
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.run?.status ?? "")
        ? 2000
        : false,
  });
}
const active = (status?: string) => status === "queued" || status === "running";
export function ImportWanderOsButton({ brandId }: { brandId: string }) {
  const client = useQueryClient();
  const progress = useImportRun(brandId);
  const start = useMutation(
    orpc.catalog.importWanderOs.mutationOptions({
      onSuccess: (result) => {
        void client.invalidateQueries({ queryKey: orpc.workflow.key() });
        client.setQueryData(
          orpc.catalog.wanderOsImportStatus.queryOptions({ input: { brandId } })
            .queryKey,
          (current: typeof progress.data) =>
            current ? { ...current, run: result.run } : undefined,
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const busy = start.isPending || active(progress.data?.run?.status);
  if (progress.data?.missingFoundations.length && !busy)
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <p className="text-muted-foreground">
          Complete {progress.data.missingFoundations.join(", ")} before
          importing.
        </p>
        <Button size="sm" variant="outline" asChild>
          <Link href={progress.data.setupHref}>Complete brand setup</Link>
        </Button>
      </div>
    );
  return (
    <Button
      size="sm"
      loading={busy}
      disabled={progress.isPending || Boolean(progress.error)}
      onClick={() => start.mutate({ brandId })}
    >
      {busy
        ? "Importing WanderOS…"
        : progress.data?.run?.status === "failed"
          ? "Retry import"
          : "Import WanderOS"}
    </Button>
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
