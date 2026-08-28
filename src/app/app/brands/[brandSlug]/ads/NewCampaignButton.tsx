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
  const [platforms, setPlatforms] = useState<("meta_ads" | "google_ads")[]>([
    "meta_ads",
  ]);
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
            A local draft — nothing reaches an ad platform until you push it.
            Pick both platforms to run one push across Meta and Google; each
            gets its own campaign under a shared initiative.
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
              placeholder="WANDER_PROSPECTING_PURCHASES"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Platforms</Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: "meta_ads", label: "Meta" },
                    { value: "google_ads", label: "Google" },
                  ] as const
                ).map((option) => {
                  const on = platforms.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setPlatforms((current) =>
                          current.includes(option.value)
                            ? current.length > 1
                              ? current.filter((p) => p !== option.value)
                              : current
                            : [...current, option.value],
                        )
                      }
                      className={`h-9 flex-1 rounded-md border text-sm transition-colors ${
                        on
                          ? "border-white/30 bg-white/10 font-medium"
                          : "border-input text-muted-foreground hover:bg-white/5"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-budget">Budget ($, optional)</Label>
              <Input
                id="camp-budget"
                type="number"
                min={0}
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
                platforms,
                budget:
                  budget === "" || !Number.isFinite(Number(budget))
                    ? null
                    : Math.max(0, Math.round(Number(budget))),
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
