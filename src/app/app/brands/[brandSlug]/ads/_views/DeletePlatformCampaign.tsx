"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

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
 * Delete the real campaign on the real ad account. This cascades to its ad
 * sets and ads on the platform, so it is a deliberate operator click behind a
 * confirm — never chat, never automatic. Local rows go only after the
 * platform confirms.
 */
export function DeletePlatformCampaign({
  platformCampaignId,
  campaignName,
  brandSlug,
  isLive,
  spend,
}: {
  platformCampaignId: string;
  campaignName: string;
  brandSlug: string;
  isLive: boolean;
  spend: number | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const remove = useMutation(
    trpc.ads.deletePlatformCampaign.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.push(`/app/brands/${brandSlug}/ads`);
      },
    }),
  );

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        tone="muted"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
        Delete
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete “{campaignName}” from the platform?
            </DialogTitle>
            <DialogDescription>
              This deletes the campaign on the ad account itself, along with its
              ad sets and ads. It cannot be undone from here.
              {isLive
                ? " This campaign is currently LIVE — pausing it may be what you want instead."
                : ""}
              {spend
                ? ` It has spent $${spend.toLocaleString()}; reporting history goes with it.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {remove.error && (
            <p className="text-xs text-red-300">{remove.error.message}</p>
          )}
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              loading={remove.isPending}
              onClick={() => remove.mutate({ platformCampaignId })}
            >
              Delete on platform
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
