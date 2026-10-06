"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { defaultCatalogAdCopy, type CatalogAdCopy } from "@/lib/catalog-studio";
import { orpc } from "@/orpc/client";
import { WorkspaceCard } from "../../../WorkspaceCard";
import { ShapeBrandButton } from "../ShapeBrandButton";

/**
 * The catalog's ad copy, saved on the brand and frozen into every export.
 * Read-only until Edit, so a chat save shows up as soon as the query refreshes.
 */
export function CatalogAdCopyCard({
  brandId,
  brandName,
  ad: saved,
}: {
  brandId: string;
  brandName: string;
  ad: CatalogAdCopy | undefined;
}) {
  const ad = saved ?? defaultCatalogAdCopy(brandName);
  const [draft, setDraft] = useState<CatalogAdCopy | null>(null);
  const client = useQueryClient();
  const save = useMutation(
    orpc.catalog.setAdCopy.mutationOptions({
      onSuccess: async () => {
        await client.invalidateQueries({
          queryKey: orpc.catalog.state.queryOptions({ input: { brandId } })
            .queryKey,
        });
        setDraft(null);
        toast.success("Ad copy saved");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <WorkspaceCard
      title="Ad copy"
      icon={MessageSquareText}
      actions={
        draft ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() => save.mutate({ brandId, ad: draft })}
            >
              Save
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => setDraft(ad)}>
              Edit
            </Button>
            <ShapeBrandButton
              brandId={brandId}
              brandName={brandName}
              section="catalog ad copy"
            />
          </>
        )
      }
    >
      {draft ? (
        <div className="max-w-2xl space-y-2">
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Primary text</span>
            <Textarea
              value={draft.primaryText}
              rows={3}
              maxLength={2200}
              disabled={save.isPending}
              onChange={(e) =>
                setDraft({ ...draft, primaryText: e.target.value })
              }
            />
          </label>
          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted-foreground">Headline</span>
              <Input
                value={draft.headline}
                maxLength={255}
                placeholder="{{hotel.name}}"
                disabled={save.isPending}
                onChange={(e) =>
                  setDraft({ ...draft, headline: e.target.value })
                }
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted-foreground">Description</span>
              <Input
                value={draft.description}
                maxLength={255}
                placeholder="From the price in the feed"
                disabled={save.isPending}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
          </div>
        </div>
      ) : (
        <dl className="grid max-w-2xl grid-cols-1 gap-3 text-sm @xl:grid-cols-2">
          <div className="space-y-1 @xl:col-span-2">
            <dt className="text-muted-foreground">Primary text</dt>
            <dd className="whitespace-pre-wrap">{ad.primaryText}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground">Headline</dt>
            <dd>{ad.headline || "Home name"}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground">Description</dt>
            <dd>{ad.description || "From the price in the feed"}</dd>
          </div>
        </dl>
      )}
    </WorkspaceCard>
  );
}
