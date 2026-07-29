"use client";

import { useMutation } from "@tanstack/react-query";
import { Clock3, Loader2, RefreshCw, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/components/ui/lib/utils";
import { useTRPC } from "@/trpc/react";

const LABELS: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
};

function operationalState(status: string | null) {
  if (status === "published") return "Done";
  if (status === "failed" || status === "partial") return "Failed";
  if (status === "publishing") return "Publishing";
  return "Queued";
}

export function SocialDeliveryControl({
  spotId,
  platform,
  status,
  scheduledAt,
  connected,
  deliveryExternalId,
  deliveryStatus,
  deliveryError,
}: {
  spotId: string;
  platform: "instagram" | "linkedin" | "x";
  status: string;
  scheduledAt: string | null;
  connected: boolean;
  deliveryExternalId: string | null;
  deliveryStatus: string | null;
  deliveryError: string | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const platformLabel = LABELS[platform] ?? platform;
  const settle = {
    onSuccess: () => router.refresh(),
    onError: (error: { message: string }) => {
      toast.error("Zernio handoff failed", { description: error.message });
    },
  };
  const deliver = useMutation(
    trpc.content.deliverSocial.mutationOptions({
      ...settle,
      onSuccess: (result) => {
        toast.success(
          result.deliveryStatus === "published"
            ? `Published to ${platformLabel}`
            : "Queued in Zernio",
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
        toast.success("Retry sent to Zernio");
        router.refresh();
      },
    }),
  );
  const busy = deliver.isPending || refresh.isPending || retry.isPending;

  if (!connected) {
    return (
      <span className="flex items-center gap-1.5 text-[11px]">
        <span className="rounded-full border border-amber-500/40 px-2 py-0.5 font-medium text-amber-400">
          Todo
        </span>
        <span className="text-muted-foreground">
          Connect {platformLabel} in Channels
        </span>
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
            deliveryStatus === "failed" || deliveryStatus === "partial"
              ? "border-red-500/40 text-red-400"
              : deliveryStatus === "published"
                ? "border-emerald-500/40 text-emerald-400"
                : "border-sky-500/40 text-sky-400",
          )}
        >
          {operationalState(deliveryStatus)}
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
        {(deliveryStatus === "failed" || deliveryStatus === "partial") && (
          <button
            type="button"
            onClick={() => retry.mutate({ platformPostId: spotId })}
            disabled={busy}
            title="Retry failed Zernio delivery"
            aria-label="Retry failed Zernio delivery"
            className="text-muted-foreground hover:text-foreground rounded p-1 disabled:opacity-50"
          >
            <RotateCcw className="size-3" />
          </button>
        )}
      </span>
    );
  }

  if (status !== "approved") {
    return (
      <span className="flex items-center gap-1.5 text-[11px]">
        <span className="rounded-full border border-amber-500/40 px-2 py-0.5 font-medium text-amber-400">
          Todo
        </span>
        <span className="text-muted-foreground">Approve for Zernio</span>
      </span>
    );
  }

  const future = scheduledAt && new Date(scheduledAt).getTime() > Date.now();
  return (
    <span className="flex items-center gap-1.5">
      <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] font-medium text-amber-400">
        Todo
      </span>
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
              `Publish this approved post to ${platformLabel} now? This is a live external action.`,
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
