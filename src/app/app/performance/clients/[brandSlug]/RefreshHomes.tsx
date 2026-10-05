"use client";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
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
  const router = useRouter();
  const refresh = useMutation(
    orpc.catalog.refreshHomes.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );
  return (
    <div>
      <Button
        variant={primary ? "default" : "outline"}
        size={primary ? "default" : "sm"}
        disabled={refresh.isPending}
        onClick={() => refresh.mutate({ brandId })}
      >
        {refresh.isPending ? "Importing…" : label}
      </Button>
      {refresh.error && (
        <p role="alert">{refresh.error.message || "Refresh failed"}</p>
      )}
    </div>
  );
}
