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
 * Delete a campaign draft. Local only — the service refuses when the campaign
 * has already produced platform campaigns, because those keep spending
 * whether or not anything here describes them.
 */
export function DeleteCampaignButton({
  campaignId,
  campaignName,
  brandSlug,
  livePlatformCampaigns,
  compact = false,
  afterDelete = "list",
  listPath,
}: {
  campaignId: string;
  campaignName: string;
  brandSlug: string;
  livePlatformCampaigns: number;
  /** A ⋯ menu for a row in a list, with the delete inside it. */
  compact?: boolean;
  listPath?: string;
  /** Where to go once it is gone: the brand's ads list, or stay and refresh. */
  afterDelete?: "list" | "refresh";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const remove = useMutation(
    orpc.ads.deleteDraftCampaign.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        if (afterDelete === "list")
          router.push(listPath ?? `/app/brands/${brandSlug}/ads`);
        else router.refresh();
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
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setOpen(true)}
            >
              Delete campaign…
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete campaign?</DialogTitle>
            <DialogDescription>
              {livePlatformCampaigns > 0
                ? `This campaign has ${livePlatformCampaigns} campaign(s) on a platform. Delete those first — removing this would only stop growth describing them, not stop them running.`
                : "Removes the draft and its ad sets and ads. Nothing exists on a platform yet, so nothing else is affected."}
            </DialogDescription>
          </DialogHeader>
          <p className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
            {campaignName}
          </p>
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
