"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTRPC } from "@/trpc/react";

/**
 * Meta's own render of a drafted ad, before anything exists on the platform.
 * The iframes come from Meta's preview API via the allowlisted connection;
 * nothing is created and nothing spends. We embed by extracted src rather
 * than injecting Meta's raw iframe HTML.
 */
export function PreviewAdButton({
  adId,
  brandSlug,
  disabled,
  disabledReason,
}: {
  adId: string;
  brandSlug: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);

  const destinations = useQuery(
    trpc.ads.destinations.queryOptions(
      { brandSlug, platform: "meta" },
      { enabled: open },
    ),
  );
  const destination = destinations.data?.destinations[0];

  const preview = useMutation(trpc.ads.previewAd.mutationOptions());

  const run = () => {
    if (!destination) return;
    preview.mutate({
      adId,
      connectionAccountId: destination.connectionAccountId,
      adAccountId: destination.adAccountId,
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={disabledReason}
        onClick={() => {
          setOpen(true);
          if (!preview.data && !preview.isPending && destination) run();
        }}
        className="absolute top-1 left-1 rounded-full bg-black/60 p-1 text-white hover:bg-black disabled:opacity-40"
      >
        <Eye className="size-3" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Meta&apos;s render of this draft</DialogTitle>
            <DialogDescription>
              Straight from Meta&apos;s preview API — nothing is created,
              nothing spends.
            </DialogDescription>
          </DialogHeader>
          {destinations.isPending ? (
            <p className="text-muted-foreground py-6 text-sm">
              Finding the allowlisted destination…
            </p>
          ) : !destination ? (
            <p className="text-muted-foreground py-6 text-sm">
              No allowlisted Meta destination for this brand — connect and allow
              an ad account on the setup page first.
            </p>
          ) : preview.isPending ? (
            <p className="text-muted-foreground py-6 text-sm">
              Asking Meta to render it…
            </p>
          ) : preview.error ? (
            <div className="space-y-3 py-4">
              <p className="text-sm text-red-300">{preview.error.message}</p>
              <Button size="sm" variant="outline" onClick={run}>
                Try again
              </Button>
            </div>
          ) : preview.data?.previewUrls.length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">
              Meta returned no renderable preview for this creative.
            </p>
          ) : preview.data ? (
            <div className="flex max-h-[70vh] gap-4 overflow-auto">
              {preview.data.previewUrls.map((src, index) => (
                <iframe
                  key={src}
                  src={src}
                  title={preview.data.formats[index] ?? `Preview ${index + 1}`}
                  className="h-[600px] w-full min-w-80 rounded-lg border bg-white"
                  sandbox="allow-scripts allow-same-origin"
                />
              ))}
            </div>
          ) : (
            <div className="py-4">
              <Button size="sm" onClick={run}>
                Render preview
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
