"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/trpc/react";

/**
 * Creates a local draft and lands on its canvas. Deliberately minimal — a
 * name and a platform are enough to start; everything else is edited in chat
 * and read on the canvas.
 */
export function NewCampaignButton({ brandId }: { brandId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<"meta_ads" | "google_ads">(
    "meta_ads",
  );
  const [budget, setBudget] = useState("");

  const create = useMutation(
    trpc.ads.createDraftCampaign.mutationOptions({
      onSuccess: (result) => {
        setOpen(false);
        router.push(result.path);
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-3.5" />
          New campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New campaign draft</DialogTitle>
          <DialogDescription>
            A local draft — nothing touches the ad platform until you launch
            it. Add ads and refine it in chat, watch it on the canvas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="camp-name">Name</Label>
            <Input
              id="camp-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="HOMI_PROSPECTING_PURCHASES"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="camp-platform">Platform</Label>
              <select
                id="camp-platform"
                value={platform}
                onChange={(event) =>
                  setPlatform(event.target.value as typeof platform)
                }
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="meta_ads">Meta Ads</option>
                <option value="google_ads">Google Ads</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-budget">Budget ($, optional)</Label>
              <Input
                id="camp-budget"
                type="number"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                placeholder="500"
              />
            </div>
          </div>
          {create.error && (
            <p className="text-xs text-red-300">{create.error.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            size="sm"
            disabled={!name.trim() || create.isPending}
            loading={create.isPending}
            onClick={() =>
              create.mutate({
                brandId,
                name: name.trim(),
                platform,
                budget: budget === "" ? null : Math.round(Number(budget)),
              })
            }
          >
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
