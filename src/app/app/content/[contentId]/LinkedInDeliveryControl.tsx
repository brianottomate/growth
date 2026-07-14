"use client";

import { useMutation } from "@tanstack/react-query";
import { Clock3, Loader2, RefreshCw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/components/ui/lib/utils";
import { useTRPC } from "@/trpc/react";

export function LinkedInDeliveryControl({
  spotId,
  status,
  scheduledAt,
  connected,
  deliveryExternalId,
  deliveryStatus,
  deliveryError,
}: {
  spotId: string;
  status: string;
  scheduledAt: string | null;
  connected: boolean;
  deliveryExternalId: string | null;
  deliveryStatus: string | null;
  deliveryError: string | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const settle = {
    onSuccess: () => router.refresh(),
    onError: (error: { message: string }) => {
      toast.error("Zernio handoff failed", { description: error.message });
    },
  };
  const deliver = useMutation(
    trpc.content.deliverLinkedIn.mutationOptions({
      ...settle,
      onSuccess: (result) => {
        toast.success(
          result.deliveryStatus === "published"
            ? "Published to LinkedIn"
            : "Queued in Zernio",
        );
        router.refresh();
      },
    }),
  );
  const refresh = useMutation(
    trpc.content.refreshLinkedInDelivery.mutationOptions(settle),
  );
  const busy = deliver.isPending || refresh.isPending;

  if (!connected) {
    return (
      <span className="text-muted-foreground text-[11px]">
        Connect LinkedIn in Channels to publish
      </span>
    );
  }

  if (deliveryExternalId) {
    return (
      <span className="flex items-center gap-1.5">
        <span
          title={deliveryError ?? undefined}
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
            deliveryStatus === "failed"
              ? "border-red-500/40 text-red-400"
              : deliveryStatus === "published"
                ? "border-emerald-500/40 text-emerald-400"
                : "border-sky-500/40 text-sky-400",
          )}
        >
          {deliveryStatus === "published"
            ? "Published via Zernio"
            : deliveryStatus === "failed"
              ? "Zernio failed"
              : "Queued in Zernio"}
        </span>
        <button
          type="button"
          onClick={() => refresh.mutate({ platformPostId: spotId })}
          disabled={busy}
          title="Refresh delivery status"
          aria-label="Refresh Zernio delivery status"
          className="text-muted-foreground hover:text-foreground rounded p-1 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
        </button>
      </span>
    );
  }

  if (status !== "approved") {
    return (
      <span className="text-muted-foreground text-[11px]">
        Approve to publish with Zernio
      </span>
    );
  }

  const future = scheduledAt && new Date(scheduledAt).getTime() > Date.now();
  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() =>
          deliver.mutate({ platformPostId: spotId, mode: "schedule" })
        }
        disabled={!future || busy}
        title={
          future ? "Queue this post in Zernio" : "Choose a future date first"
        }
        className="border-border text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium disabled:opacity-40"
      >
        {deliver.isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Clock3 className="size-3" />
        )}
        Queue in Zernio
      </button>
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(
              "Publish this approved post to LinkedIn now? This is a live external action.",
            )
          ) {
            deliver.mutate({ platformPostId: spotId, mode: "publish_now" });
          }
        }}
        disabled={busy}
        className="border-border text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium disabled:opacity-40"
      >
        <Send className="size-3" /> Publish now
      </button>
    </span>
  );
}
