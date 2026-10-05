"use client";
import { useWorkspaceMutation } from "./useWorkspaceMutation";
import { Button } from "@/components/ui/button";
import { orpc } from "@/orpc/client";
export function RefreshHomes({
  brandId,
  label = "Refresh homes",
  primary = false,
}: {
  brandId: string;
  label?: string;
  primary?: boolean;
}) {
  const refresh = useWorkspaceMutation(
    orpc.catalog.refreshHomes.mutationOptions({}),
  );
  return (
    <div>
      <Button
        variant={primary ? "default" : "outline"}
        size={primary ? "default" : "sm"}
        loading={refresh.isPending}
        onClick={() => refresh.mutate({ brandId })}
      >
        {refresh.isPending ? "Importing…" : label}
      </Button>
    </div>
  );
}
