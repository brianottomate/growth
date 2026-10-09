"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { MoreHorizontal, Share2, Trash2 } from "lucide-react";

import { ClientPreviewLink } from "@/app/app/performance/clients/[brandSlug]/ads/ClientPreviewLink";
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
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

/**
 * Delete a campaign draft. Local only — the service refuses when the campaign
 * has already produced platform campaigns, because those keep spending
 * whether or not anything here describes them.
 */
export function DeleteCampaignButton({
  campaignId,
  previewBrandId,
  campaignName,
  brandSlug,
  livePlatformCampaigns,
  platformCampaignIds = [],
  compact = false,
  afterDelete = "list",
  listPath,
}: {
  campaignId: string;
  previewBrandId?: string;
  campaignName: string;
  brandSlug: string;
  livePlatformCampaigns: number;
  /** The platform rows that are live, so "also delete on the platform" can remove them. */
  platformCampaignIds?: string[];
  /** A ⋯ menu for a row in a list, with the delete inside it. */
  compact?: boolean;
  listPath?: string;
  /** Where to go once it is gone: the brand's ads list, or stay and refresh. */
  afterDelete?: "list" | "refresh";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const onPlatform = livePlatformCampaigns > 0;
  const finish = (result: { mediaCleanup: { errors: string[] } }) => {
    if (result.mediaCleanup.errors.length)
      toast.error(
        "Campaign deleted. Some generated media could not be cleaned up; their library records were kept.",
      );
    setOpen(false);
    if (afterDelete === "list")
      router.push(listPath ?? `/app/brands/${brandSlug}/ads`);
    else router.refresh();
  };
  const removeEverywhere = useMutation({
    mutationFn: async () => {
      for (const platformCampaignId of platformCampaignIds)
        await orpc.ads.deletePlatformCampaign.call({ platformCampaignId });
      return orpc.ads.deleteDraftCampaign.call({ campaignId });
    },
    onSuccess: finish,
  });
  const removeHereOnly = useMutation(
    orpc.ads.deleteCampaignLeavingPlatform.mutationOptions({
      onSuccess: finish,
    }),
  );
  const remove = useMutation(
    orpc.ads.deleteDraftCampaign.mutationOptions({ onSuccess: finish }),
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
            {previewBrandId && (
              <DropdownMenuItem onSelect={() => setPreviewOpen(true)}>
                <Share2 className="size-4" />
                Client preview
              </DropdownMenuItem>
            )}
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

      {previewBrandId && previewOpen && (
        <ClientPreviewLink
          brandId={previewBrandId}
          campaign={{ id: campaignId, name: campaignName }}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete campaign?</DialogTitle>
            <DialogDescription>
              {onPlatform
                ? `This campaign is on a platform (${livePlatformCampaigns}). Deleting it there removes its ad sets, ads and reporting history and cannot be undone. Deleting it here only leaves it running and spending, with nothing in Growth describing it.`
                : "Removes the draft and its ad sets and ads. Also removes generated exports unused elsewhere. Source photos and shared media are kept."}
            </DialogDescription>
          </DialogHeader>
          <p className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
            {campaignName}
          </p>
          {(remove.error ?? removeEverywhere.error ?? removeHereOnly.error) && (
            <p className="text-xs text-red-300">
              {
                (remove.error ?? removeEverywhere.error ?? removeHereOnly.error)
                  ?.message
              }
            </p>
          )}
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {onPlatform ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    removeHereOnly.isPending || removeEverywhere.isPending
                  }
                  loading={removeHereOnly.isPending}
                  onClick={() => removeHereOnly.mutate({ campaignId })}
                >
                  Delete here only
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={
                    platformCampaignIds.length === 0 ||
                    removeHereOnly.isPending ||
                    removeEverywhere.isPending
                  }
                  loading={removeEverywhere.isPending}
                  onClick={() => removeEverywhere.mutate()}
                >
                  Delete here and on the platform
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                disabled={remove.isPending}
                loading={remove.isPending}
                onClick={() => remove.mutate({ campaignId })}
              >
                Delete draft
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
