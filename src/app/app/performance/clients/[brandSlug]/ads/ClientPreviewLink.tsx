"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

function copyLink(url: string) {
  void navigator.clipboard
    .writeText(url)
    .then(() => toast.success("Preview link copied"))
    .catch(() => toast.error("Could not copy the link"));
}

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

/**
 * A no-login link a client can open, or save as PDF or PNG: one campaign's
 * approved ads and one catalog export.
 */
export function ClientPreviewLink({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [catalogExportId, setCatalogExportId] = useState("");
  const [days, setDays] = useState(30);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(
    null,
  );
  const options = useQuery({
    ...orpc.adPreview.options.queryOptions({ input: { brandId } }),
    enabled: open,
  });
  const create = useMutation(
    orpc.adPreview.createLink.mutationOptions({
      onSuccess: (result) => {
        setLink(result);
        copyLink(result.url);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const campaigns = options.data?.campaigns ?? [];
  const exports = options.data?.catalogExports ?? [];
  return (
    <SimpleDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setLink(null);
      }}
      title="Client preview link"
      size="lg"
      trigger={
        <Button size="sm" variant="outline">
          <Share2 className="size-3.5" />
          Client preview
        </Button>
      }
    >
      {link ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input readOnly value={link.url} aria-label="Preview link" />
            <Button variant="outline" onClick={() => copyLink(link.url)}>
              <Copy className="size-3.5" />
              Copy
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Expires {new Date(link.expiresAt).toLocaleDateString()}
          </p>
          <Button asChild variant="outline">
            <a href={link.url} target="_blank" rel="noreferrer">
              Open preview
            </a>
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              brandId,
              campaignId: campaignId || null,
              catalogExportId: catalogExportId || null,
              expiresInDays: days,
            });
          }}
        >
          <label className="block space-y-1.5 text-sm font-medium">
            Campaign
            <select
              className={selectClass}
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
            >
              <option value="">None</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name} · {campaign.approved} approved
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Catalog export
            <select
              className={selectClass}
              value={catalogExportId}
              onChange={(event) => setCatalogExportId(event.target.value)}
            >
              <option value="">None</option>
              {exports.map((row) => (
                <option key={row.id} value={row.id}>
                  {new Date(row.createdAt).toLocaleString()} · {row.cards} cards
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            Expires after
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              {[7, 30, 90].map((value) => (
                <option key={value} value={value}>
                  {value} days
                </option>
              ))}
            </select>
          </label>
          <Button
            type="submit"
            disabled={
              create.isPending ||
              options.isPending ||
              (!campaignId && !catalogExportId)
            }
          >
            {create.isPending ? "Saving images…" : "Create link"}
          </Button>
        </form>
      )}
    </SimpleDialog>
  );
}
