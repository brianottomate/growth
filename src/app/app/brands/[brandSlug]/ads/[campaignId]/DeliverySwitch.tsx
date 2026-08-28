"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTRPC } from "@/trpc/react";

/**
 * Launch/Pause. Resuming a campaign starts real spend, so the click routes
 * through a confirm dialog that states the money line — the confirm IS the
 * operator approval the ads-write policy requires.
 */
export function DeliverySwitch({
  campaignId,
  status,
  hasExternalId,
  spendLine,
}: {
  campaignId: string;
  status: string;
  hasExternalId: boolean;
  spendLine: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const toggle = useMutation(
    trpc.ads.setCampaignDelivery.mutationOptions({
      onSuccess: () => {
        setConfirming(false);
        router.refresh();
      },
    }),
  );

  if (!hasExternalId) {
    return (
      <span
        className="text-muted-foreground/70 text-xs"
        title="Add ads, then push the draft to Meta. Launch appears once the campaign exists on the platform."
      >
        draft — push it to Meta to launch
      </span>
    );
  }

  const isRunning = status === "live";

  return (
    <>
      <Button
        size="sm"
        variant={isRunning ? "outline" : "default"}
        onClick={() =>
          isRunning
            ? toggle.mutate({ campaignId, status: "paused" })
            : setConfirming(true)
        }
        loading={toggle.isPending}
      >
        {isRunning ? (
          <>
            <Pause className="size-3.5" />
            Pause
          </>
        ) : (
          <>
            <Play className="size-3.5" />
            Launch
          </>
        )}
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Launch this campaign?</DialogTitle>
            <DialogDescription>
              Delivery resumes on the platform and spend starts against{" "}
              {spendLine}. Ads still in review start when the platform approves
              them.
            </DialogDescription>
          </DialogHeader>
          {toggle.error && (
            <p className="text-xs text-red-300">{toggle.error.message}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={toggle.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={toggle.isPending}
              onClick={() => toggle.mutate({ campaignId, status: "active" })}
            >
              Launch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
