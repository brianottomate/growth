"use client";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
export function RefreshMeta({
  platformCampaignId,
}: {
  platformCampaignId: string;
}) {
  const router = useRouter();
  const refresh = useMutation(
    orpc.ads.refreshMeta.mutationOptions({ onSuccess: () => router.refresh() }),
  );
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        disabled={refresh.isPending}
        onClick={() => refresh.mutate({ platformCampaignId })}
      >
        {refresh.isPending ? "Refreshing Meta…" : "Refresh Meta"}
      </Button>
      {refresh.error && (
        <p className="text-xs text-destructive">{refresh.error.message}</p>
      )}
      {refresh.data?.errors.map((error) => (
        <p className="text-xs text-destructive" key={error}>
          {error}
        </p>
      ))}
    </div>
  );
}
