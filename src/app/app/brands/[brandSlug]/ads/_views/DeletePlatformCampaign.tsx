"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { MoreHorizontal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/orpc/client";

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
  hasExternalId = true,
  compact = false,
  afterDelete = "list",
  connectionAccountId,
}: {
  platformCampaignId: string;
  campaignName: string;
  brandSlug: string;
  isLive: boolean;
  spend: number | null;
  hasExternalId?: boolean;
  compact?: boolean;
  afterDelete?: "list" | "refresh";
  connectionAccountId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const remove = useMutation(
    orpc.ads.deletePlatformCampaign.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        if (afterDelete === "refresh") router.refresh();
        else router.push(`/app/brands/${brandSlug}/ads`);
      },
    }),
  );

  return (
    <>
      {compact ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            appearance="icon"
            aria-label={`More for ${campaignName}`}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setOpen(true)}
            >
              <Trash2 className="size-4" />
              {hasExternalId ? "Delete on platform…" : "Remove platform…"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          tone="muted"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!remove.isPending) setOpen(value);
        }}
      >
        <DialogContent className="gap-4 pb-6">
          <DialogHeader>
            <DialogTitle>
              {hasExternalId
                ? `Delete “${campaignName}” from the platform?`
                : `Remove “${campaignName}” platform setup?`}
            </DialogTitle>
            <DialogDescription>
              {hasExternalId
                ? "This deletes the provider campaign, its ad sets and ads, and removes its records here after the provider confirms. Provider deletion also removes reporting history and cannot be undone here. Your campaign audiences and approved ads stay available."
                : "This removes the local platform setup and its saved delivery settings. Your campaign audiences and approved ads stay available."}
              {isLive &&
                " This campaign is delivering. You can pause it using the delivery control before deleting."}
              {!!spend && ` Recorded spend: $${spend.toLocaleString()}.`}
            </DialogDescription>
          </DialogHeader>
          {remove.error && (
            <p className="text-xs text-muted-foreground">
              {remove.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              loading={remove.isPending}
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate({ platformCampaignId, connectionAccountId })
              }
            >
              {hasExternalId ? "Delete on platform" : "Remove platform"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
