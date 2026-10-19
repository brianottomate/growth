"use client";
import { BroadcastDeliveryStatus } from "../BroadcastDeliveryStatus";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Send } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orpc, type RouterOutputs } from "@/orpc/client";

type Workspace = RouterOutputs["newsletter"]["workspace"];

const buttonClass =
  "flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50";
const primaryClass =
  "flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";

/**
 * Test, prepare, approve and send the saved email as the brand, through its
 * own provider. Sending is on demand; the issue's date is the plan.
 */
export function SendCard({
  workspace,
  dirty,
}: {
  workspace: Workspace;
  dirty: boolean;
}) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.newsletter.workspace.queryKey({
        input: { platformPostId: workspace.spot.id },
      }),
    });
  const [snapshotId, setSnapshotId] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  const blockers = workspace.brand.sendBlockers;
  const creativeApproved = workspace.spot.status === "approved";
  const canDispatch = creativeApproved || workspace.spot.status === "published";
  const latest = workspace.messageSends.find(
    (send) => send.provider === "postmark",
  );
  const audiences = useQuery({
    ...orpc.newsletter.sendAudiences.queryOptions({
      input: { brandId: workspace.brand.id },
    }),
    enabled: blockers.length === 0,
  });
  const progress = useQuery({
    ...orpc.newsletter.sendProgress.queryOptions({
      input: { messageSendId: latest?.id ?? "" },
    }),
    enabled: Boolean(latest && latest.status !== "draft"),
  });

  const test = useMutation(orpc.newsletter.sendTest.mutationOptions());
  const prepare = useMutation(
    orpc.newsletter.prepareBrandSend.mutationOptions({ onSuccess: refresh }),
  );
  const approve = useMutation(
    orpc.newsletter.approveSend.mutationOptions({ onSuccess: refresh }),
  );
  const send = useMutation(
    orpc.newsletter.sendApproved.mutationOptions({
      onSettled: async () => {
        setConfirming(false);
        await refresh();
        await progress.refetch();
      },
    }),
  );
  const error = test.error ?? prepare.error ?? approve.error ?? send.error;

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Send</h2>
      {latest && <BroadcastDeliveryStatus messageSendId={latest.id} />}
      {!canDispatch && (
        <p className="mt-2 text-sm text-muted-foreground">
          Approve the creative to prepare delivery. You can send yourself a test
          while reviewing.
        </p>
      )}
      {blockers.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => test.mutate({ platformPostId: workspace.spot.id })}
              disabled={test.isPending || dirty}
              className={buttonClass}
            >
              {test.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send test to me
            </button>
            {test.data && (
              <span className="text-sm text-muted-foreground">
                Sent to {test.data.to}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={snapshotId} onValueChange={setSnapshotId}>
              <SelectTrigger className="w-[260px]" aria-label="Audience">
                <SelectValue
                  placeholder={
                    audiences.data?.length === 0
                      ? "No compiled audience"
                      : "Audience"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {audiences.data?.map((audience) => (
                  <SelectItem
                    key={audience.id}
                    value={audience.id}
                    disabled={!audience.consentConfirmed}
                  >
                    {audience.name} · {audience.recipientCount ?? 0} guests
                    {audience.consentConfirmed
                      ? ""
                      : " · permission unconfirmed"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() =>
                snapshotId &&
                prepare.mutate({
                  platformPostId: workspace.spot.id,
                  snapshotId,
                })
              }
              disabled={
                !snapshotId || prepare.isPending || dirty || !canDispatch
              }
              className={buttonClass}
            >
              {prepare.isPending && <Loader2 className="size-4 animate-spin" />}
              Prepare
            </button>
          </div>

          {latest && (
            <div className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {latest.status}
                </span>
                <span>{latest.audienceLabel}</span>
                {latest.sentAt && (
                  <span className="text-muted-foreground">
                    · {new Date(latest.sentAt).toLocaleString()}
                  </span>
                )}
              </div>
              {progress.data && latest.status !== "draft" && (
                <p className="mt-2 text-muted-foreground">
                  {progress.data.sent} sent · {progress.data.skipped} skipped ·{" "}
                  {progress.data.failed} failed
                  {progress.data.pending
                    ? ` · ${progress.data.pending} unconfirmed`
                    : ""}
                </p>
              )}
              {latest.error && (
                <p className="mt-2 text-red-500">{latest.error}</p>
              )}
              {workspace.canDeliver && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(latest.status === "draft" ||
                    latest.status === "failed") && (
                    <button
                      type="button"
                      onClick={() =>
                        approve.mutate({ messageSendId: latest.id })
                      }
                      disabled={approve.isPending || !canDispatch}
                      className={buttonClass}
                    >
                      <Check className="size-4" /> Approve
                    </button>
                  )}
                  {(latest.status === "approved" ||
                    latest.status === "sending") &&
                    (confirming ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            send.mutate({
                              messageSendId: latest.id,
                              confirmation: "SEND",
                            })
                          }
                          disabled={send.isPending || !canDispatch}
                          className={primaryClass}
                        >
                          {send.isPending && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          Send to {latest.audienceLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(false)}
                          disabled={send.isPending}
                          className={buttonClass}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        disabled={!canDispatch}
                        className={primaryClass}
                      >
                        <Send className="size-4" /> Send now
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-500">{error.message}</p>}
    </section>
  );
}
