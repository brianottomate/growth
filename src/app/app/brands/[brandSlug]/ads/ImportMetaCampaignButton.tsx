"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function ImportMetaCampaignButton({ brandSlug }: { brandSlug: string }) {
  const [open, setOpen] = useState(false),
    [externalCampaignId, setId] = useState(""),
    [name, setName] = useState("");
  const trpc = useTRPC(),
    router = useRouter();
  const save = useMutation(
    trpc.ads.importMetaCampaign.mutationOptions({
      onSuccess: (r) => {
        setOpen(false);
        router.push(r.path);
        router.refresh();
      },
    }),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!save.isPending) setOpen(value);
      }}
    >
      <Button variant="outline" onClick={() => setOpen(true)}>
        Import from Meta
      </Button>
      <DialogContent showCloseButton={!save.isPending}>
        <DialogHeader>
          <DialogTitle>Import a Meta campaign</DialogTitle>
          <DialogDescription>
            Create a local working copy with original artwork and source
            settings. The live campaign stays unchanged. Unsupported settings
            are flagged for review.
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-1 text-sm">
          Meta campaign ID
          <Input
            value={externalCampaignId}
            onChange={(e) => setId(e.target.value)}
            disabled={save.isPending}
          />
        </label>
        <label className="space-y-1 text-sm">
          Working copy name
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={save.isPending}
          />
        </label>
        {save.error && <p role="alert">{save.error.message}</p>}
        <Button
          loading={save.isPending}
          disabled={!externalCampaignId.trim() || !name.trim()}
          onClick={() =>
            save.mutate({
              brandSlug,
              externalCampaignId: externalCampaignId.trim(),
              name: name.trim(),
            })
          }
        >
          {save.isPending
            ? "Reading Meta and saving original artwork…"
            : "Create working copy"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
