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
 * Delete a campaign draft. Local only — the service refuses when the campaign
 * has already produced platform campaigns, because those keep spending
 * whether or not anything here describes them.
 */
export function DeleteCampaignButton({
  campaignId,
  campaignName,
  brandSlug,
  livePlatformCampaigns,
}: {
  campaignId: string;
  campaignName: string;
  brandSlug: string;
  livePlatformCampaigns: number;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const remove = useMutation(
    trpc.ads.deleteDraftCampaign.mutationOptions({
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
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
        Delete
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{campaignName}”?</DialogTitle>
            <DialogDescription>
              {livePlatformCampaigns > 0
                ? `This campaign has ${livePlatformCampaigns} campaign(s) on a platform. Delete those first — removing this would only stop growth describing them, not stop them running.`
                : "Removes the draft and its ad sets and ads. Nothing exists on a platform yet, so nothing else is affected."}
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
              disabled={livePlatformCampaigns > 0 || remove.isPending}
              loading={remove.isPending}
              onClick={() => remove.mutate({ campaignId })}
            >
              Delete draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
