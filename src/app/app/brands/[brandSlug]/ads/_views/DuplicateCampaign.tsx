"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Copy, MoreHorizontal } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import {
  campaignPath,
  type CampaignWorkspace,
} from "@/lib/campaign-navigation";
import { orpc } from "@/orpc/client";

/**
 * Copy the campaign inside Growth: ads, audiences and platform drafts under
 * fresh ids, nothing on any platform. The copy opens as a draft; pushing it
 * is the separate step.
 */
export function DuplicateCampaign({
  campaignId,
  campaignName,
  brandSlug,
  workspace,
}: {
  campaignId: string;
  campaignName: string;
  brandSlug: string;
  workspace: CampaignWorkspace;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${campaignName} copy`);

  const duplicate = useMutation(
    orpc.ads.duplicateCampaign.mutationOptions({
      onSuccess: (result) => {
        setOpen(false);
        router.push(campaignPath(brandSlug, result.campaign.id, workspace));
      },
    }),
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          appearance="icon"
          aria-label={`More for ${campaignName}`}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen(true)}>
            <Copy className="size-4" />
            Duplicate campaign…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!duplicate.isPending) setOpen(value);
        }}
      >
        <DialogContent className="gap-4 pb-6">
          <DialogHeader>
            <DialogTitle>Duplicate “{campaignName}”</DialogTitle>
            <DialogDescription>
              Copies the ads, audiences and platform setup into a new draft
              campaign here in Growth. Nothing is created on the platform until
              you push the copy, and it arrives paused. The copied ads are
              editable again.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Name for the copy"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={duplicate.isPending}
          />
          {duplicate.error && (
            <p className="text-xs text-muted-foreground">
              {duplicate.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              disabled={duplicate.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={duplicate.isPending}
              disabled={duplicate.isPending || !name.trim()}
              onClick={() =>
                duplicate.mutate({ campaignId, name: name.trim() })
              }
            >
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
