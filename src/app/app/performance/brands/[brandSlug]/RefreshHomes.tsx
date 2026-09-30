"use client";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { orpc } from "@/orpc/client";
export function RefreshHomes({ brandId }: { brandId: string }) {
  const router = useRouter();
  const refresh = useMutation(
    orpc.catalog.refreshHomes.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );
  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        disabled={refresh.isPending}
        onClick={() => refresh.mutate({ brandId })}
      >
        {refresh.isPending ? "Refreshing…" : "Refresh homes"}
      </Button>
      {refresh.error && (
        <p role="alert">{refresh.error.message || "Refresh failed"}</p>
      )}
    </div>
  );
}
