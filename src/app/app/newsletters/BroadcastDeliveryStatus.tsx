"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";

export function BroadcastDeliveryStatus({
  messageSendId,
}: {
  messageSendId: string;
}) {
  const status = useQuery(
    orpc.newsletter.broadcastStatus.queryOptions({ input: { messageSendId } }),
  );
  const refresh = () => {
    void status.refetch();
  };
  const pause = useMutation(
    orpc.newsletter.pauseBroadcast.mutationOptions({ onSuccess: refresh }),
  );
  const recover = useMutation(
    orpc.newsletter.recoverBroadcast.mutationOptions({ onSuccess: refresh }),
  );
  const schedule = status.data?.schedule;
  if (!schedule) return null;
  const busy = pause.isPending || recover.isPending;
  return (
    <div className="mt-3 space-y-2 rounded-md border p-3 text-sm">
      <p>
        Delivery{" "}
        {schedule.state === "approved" ? "awaiting queue" : schedule.state} ·{" "}
        {new Intl.DateTimeFormat("en-US", {
          timeZone: schedule.timeZone,
          dateStyle: "full",
          timeStyle: "short",
        }).format(new Date(schedule.dueAt))}{" "}
        ({schedule.timeZone})
      </p>
      <p className="text-muted-foreground">
        Send status: {status.data?.status}. Pausing cannot recall messages
        already accepted by the provider.
      </p>
      <div className="flex flex-wrap gap-2">
        {schedule.state !== "paused" &&
          ["approved", "sending"].includes(status.data?.status ?? "") && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => pause.mutate({ messageSendId })}
            >
              Pause delivery
            </Button>
          )}
        {schedule.state !== "paused" && status.data?.status === "approved" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Recover this approved schedule? If its send time has passed, it may send immediately.",
                )
              )
                recover.mutate({ messageSendId });
            }}
          >
            Recover queue
          </Button>
        )}
      </div>
      {(pause.error || recover.error) && (
        <p role="alert">{(pause.error ?? recover.error)?.message}</p>
      )}
    </div>
  );
}
