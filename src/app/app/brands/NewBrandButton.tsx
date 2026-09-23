"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Globe, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpc, type RouterOutputs } from "@/orpc/client";

type Enrichment = RouterOutputs["brand"]["previewEnrichment"];

/**
 * URL → Enrich → the form fills itself → Save. The scrape happens before the
 * brand exists (brand.previewEnrichment), the values preview on the client,
 * and ride up again on create. Only the name stays editable — everything
 * else is the site's own words.
 */
export function NewBrandButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [website, setWebsite] = useState("");
  const [name, setName] = useState("");
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);

  const enrich = useMutation(
    orpc.brand.previewEnrichment.mutationOptions({
      onSuccess: (result) => {
        setEnrichment(result);
        if (!name.trim() && result.suggestedName) {
          setName(result.suggestedName);
        }
      },
    }),
  );

  const createM = useMutation(
    orpc.brand.create.mutationOptions({
      onSuccess: (brand) => {
        setOpen(false);
        setName("");
        setWebsite("");
        setEnrichment(null);
        // Land on setup, not the brand overview: a brand created seconds ago
        // has nothing to show, and the actual next step (send the connect
        // link, allow the ad accounts) is what setup holds.
        if (brand?.slug) {
          router.push(`/app/brands/${brand.slug}/setup`);
        } else {
          router.refresh();
        }
      },
    }),
  );

  const save = () =>
    createM.mutate({
      name: name.trim(),
      scope: "owned",
      brandType: "company",
      website: enrichment?.website ?? (website.trim() || undefined),
      enrichment: enrichment
        ? {
            tagline: enrichment.tagline,
            description: enrichment.description,
            logo: enrichment.logo,
            websiteMeta: enrichment.websiteMeta,
            brandIdentity: enrichment.brandIdentity,
          }
        : undefined,
      // The preview already ran (or was skipped on purpose) — never re-scrape
      // in the background on this path.
      enrich: false,
    });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        New brand
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New brand</DialogTitle>
            <DialogDescription>
              Drop the website in and let the enrichment fill the rest.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Website</Label>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="example.com"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && website.trim()) {
                      enrich.mutate({ website: website.trim() });
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={!website.trim() || enrich.isPending}
                  loading={enrich.isPending}
                  onClick={() => enrich.mutate({ website: website.trim() })}
                >
                  <Sparkles className="size-3.5" />
                  Enrich
                </Button>
              </div>
              {enrich.error && (
                <p className="text-xs text-red-300">{enrich.error.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            {enrichment && (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-secondary/30 p-3">
                {enrichment.logo ? (
                  // oxlint-disable-next-line nextjs/no-img-element
                  <img
                    src={enrichment.logo}
                    alt=""
                    className="size-14 shrink-0 rounded-lg border bg-muted object-cover"
                  />
                ) : (
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-muted">
                    <Globe className="size-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 space-y-0.5">
                  {enrichment.tagline && (
                    <p className="truncate text-sm font-medium">
                      {enrichment.tagline}
                    </p>
                  )}
                  {enrichment.description && (
                    <p className="line-clamp-3 text-xs text-muted-foreground">
                      {enrichment.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground/60">
                    {enrichment.website}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={createM.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              loading={createM.isPending}
              disabled={!name.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
