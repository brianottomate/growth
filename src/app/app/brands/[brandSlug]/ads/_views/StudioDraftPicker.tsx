"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { orpc } from "@/orpc/client";
import { eligiblePlatformAds } from "@/lib/platform-ad-plan";
import type { Ad, PlatformCampaign } from "@/server/db/ads-schema";

/** Planning references only. Studio retains authoring and approval ownership. */
export function StudioDraftPicker({
  ads,
  platforms,
}: {
  ads: Ad[];
  platforms: PlatformCampaign[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const drafts = platforms.filter((p) => p.status === "draft" && !p.externalId);
  const save = useMutation({
    mutationFn: async () => {
      for (const platform of drafts) {
        const eligible = eligiblePlatformAds(
          ads.filter((ad) => chosen.includes(ad.id)),
          platform.platform,
          platform.settings ?? {},
        );
        await orpc.ads.setPlatformDraft.call({
          platformCampaignId: platform.id,
          previewAdIds: eligible.map((ad) => ad.id),
        });
      }
    },
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setChosen([
            ...new Set(drafts.flatMap((p) => p.settings?.previewAdIds ?? [])),
          ]);
          setQuery("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!drafts.length}>
          Preview Studio drafts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Studio drafts for this campaign</DialogTitle>
          <DialogDescription>
            Review ideas alongside the platform plans. Creative drafts appear in
            Meta; text drafts in Google Search. Approval and assignment are
            still required before publishing.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Find Studio drafts"
          placeholder="Find an ad by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {ads
            .filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
            .map((ad) => (
              <label
                key={ad.id}
                className="flex items-start gap-3 rounded-lg border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={chosen.includes(ad.id)}
                  disabled={save.isPending}
                  onChange={(e) =>
                    setChosen((ids) =>
                      e.target.checked
                        ? [...ids, ad.id]
                        : ids.filter((id) => id !== ad.id),
                    )
                  }
                />
                <span>
                  <span className="block font-medium">{ad.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {ad.type === "text" ? "Search text" : "Creative"} ·{" "}
                    {ad.status}
                  </span>
                </span>
              </label>
            ))}
        </div>
        {save.error && (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        )}
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save draft previews"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
