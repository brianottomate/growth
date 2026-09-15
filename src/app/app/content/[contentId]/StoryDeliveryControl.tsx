"use client";

import { useMutation } from "@tanstack/react-query";
import { Clock3, Loader2, RefreshCw, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/components/ui/lib/utils";
import { platformLabel } from "@/components/channel-logos";
import { useTRPC } from "@/trpc/react";

type StoryDeliveryItem = {
  deliveryExternalId?: string | null;
  deliveryStatus?: string | null;
  deliveryError?: string | null;
};

export function StoryDeliveryControl({
  spotId,
  platform,
  status,
  scheduledAt,
  connected,
  items,
}: {
  spotId: string;
  platform: string;
  status: string;
  scheduledAt: string | null;
  connected: boolean;
  items: StoryDeliveryItem[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const settle = {
    onSuccess: () => router.refresh(),
    onError: (error: { message: string }) => {
      toast.error("Zernio Story handoff failed", {
        description: error.message,
      });
    },
  };
  const deliver = useMutation(
    trpc.content.deliverSocial.mutationOptions({
      ...settle,
      onSuccess: (result) => {
        const handedOffCount =
          "handedOffCount" in result ? result.handedOffCount : items.length;
        toast.success(
          `Sent ${handedOffCount} ${handedOffCount === 1 ? "Story frame" : "Story frames"} to Zernio`,
        );
        router.refresh();
      },
    }),
  );
  const refresh = useMutation(
    trpc.content.refreshSocialDelivery.mutationOptions(settle),
  );
  const retry = useMutation(
    trpc.content.retrySocialDelivery.mutationOptions({
      ...settle,
      onSuccess: () => {
        toast.success("Failed Story frames sent back to Zernio");
        router.refresh();
      },
    }),
  );
  const busy = deliver.isPending || refresh.isPending || retry.isPending;
  const delivered = items.filter((item) => item.deliveryExternalId).length;
  const failed = items.find(
    (item) =>
      item.deliveryStatus === "failed" || item.deliveryStatus === "partial",
  );
  const retryable = items.some(
    (item) =>
      item.deliveryExternalId &&
      (item.deliveryStatus === "failed" || item.deliveryStatus === "partial"),
  );

  if (!connected) {
    return (
      <span className="text-[11px] text-muted-foreground">
        Connect {platformLabel(platform)} in Channels to publish Stories
      </span>
    );
  }

  if (delivered > 0) {
    const allDelivered = delivered === items.length;
    return (
      <span className="flex items-center gap-1.5">
        <span
          title={failed?.deliveryError ?? undefined}
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            failed
              ? "border-red-500/40 text-red-400"
              : allDelivered
                ? "border-sky-500/40 text-sky-400"
                : "border-amber-500/40 text-amber-400",
          )}
        >
          {failed
            ? `${delivered}/${items.length} frames sent`
            : allDelivered
              ? `${items.length} frames in Zernio`
              : `${delivered}/${items.length} frames in Zernio`}
        </span>
        {!allDelivered && (
          <button
            type="button"
            onClick={() => {
              const mode =
                scheduledAt && new Date(scheduledAt).getTime() > Date.now()
                  ? "schedule"
                  : "publish_now";
              if (
                mode === "publish_now" &&
                !window.confirm(
                  `Publish the remaining approved Story frames to ${platformLabel(platform)} now? This is a live external action.`,
                )
              ) {
                return;
              }
              deliver.mutate({
                platformPostId: spotId,
                mode,
              });
            }}
            disabled={busy}
            className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            Retry remaining
          </button>
        )}
        {retryable && (
          <button
            type="button"
            onClick={() => retry.mutate({ platformPostId: spotId })}
            disabled={busy}
            title="Retry failed Story frames in Zernio"
            aria-label="Retry failed Story frames in Zernio"
            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="size-3" />
          </button>
        )}
        <button
          type="button"
          onClick={() => refresh.mutate({ platformPostId: spotId })}
          disabled={busy}
          title="Refresh Story delivery status"
          aria-label="Refresh Story delivery status"
          className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
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
      <span className="text-[11px] text-muted-foreground">
        Approve to publish Stories with Zernio
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
          future
            ? "Queue every Story frame in Zernio"
            : "Choose a future date first"
        }
        className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        {deliver.isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Clock3 className="size-3" />
        )}
        Queue Stories
      </button>
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(
              `Publish all ${items.length} approved Story frames to ${platformLabel(platform)} now? This is a live external action.`,
            )
          ) {
            deliver.mutate({ platformPostId: spotId, mode: "publish_now" });
          }
        }}
        disabled={busy}
        className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <Send className="size-3" /> Publish now
      </button>
    </span>
  );
}
