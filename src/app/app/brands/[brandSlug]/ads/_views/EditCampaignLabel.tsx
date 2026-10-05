"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { orpc } from "@/orpc/client";
import { campaignDisplayName } from "@/lib/campaign-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

export function EditCampaignLabel({
  campaignId,
  name,
}: {
  campaignId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(campaignDisplayName(name));
  const router = useRouter();
  const client = useQueryClient();
  const save = useMutation(
    orpc.campaign.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          client.invalidateQueries({ queryKey: orpc.campaign.key() }),
          client.invalidateQueries({ queryKey: orpc.ads.key() }),
          client.invalidateQueries({ queryKey: orpc.initiative.key() }),
        ]);
        setOpen(false);
        router.refresh();
        toast.success("Campaign label updated");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!save.isPending) {
          setOpen(value);
          if (value) setLabel(campaignDisplayName(name));
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Edit campaign label"
          title="Edit campaign label"
        >
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (label.trim() && !save.isPending)
              save.mutate({ id: campaignId, name: label.trim() });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit campaign label</DialogTitle>
            <DialogDescription>
              Choose a name your team recognizes. Names of campaigns already
              pushed to a platform stay as they are.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-2">
            <Label htmlFor="campaign-label">Campaign label</Label>
            <Input
              id="campaign-label"
              autoFocus
              required
              maxLength={300}
              value={label}
              disabled={save.isPending}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!label.trim() || save.isPending}
              loading={save.isPending}
            >
              Save label
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
