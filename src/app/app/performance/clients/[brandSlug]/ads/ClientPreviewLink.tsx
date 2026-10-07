"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { campaignDisplayName } from "@/lib/campaign-navigation";
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
export function ClientPreviewLink({
  brandId,
  campaign,
}: {
  brandId: string;
  campaign?: { id: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState(campaign?.id ?? "");
  const [catalogExportId, setCatalogExportId] = useState("");
  const [catalogMode, setCatalogMode] = useState<"all" | "selected">("all");
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
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
  const catalog = exports.find((row) => row.id === catalogExportId);
  const campaignAvailable =
    !campaign || campaigns.some((row) => row.id === campaign.id);
  return (
    <SimpleDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setLink(null);
          setCampaignId(campaign?.id ?? "");
        }
      }}
      title={
        campaign
          ? `Client preview · ${campaignDisplayName(campaign.name)}`
          : "Client preview link"
      }
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
              catalogCardIndexes:
                catalogExportId && catalogMode === "selected"
                  ? selectedCards
                  : null,
              expiresInDays: days,
            });
          }}
        >
          {campaign ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium break-words">
                {campaignDisplayName(campaign.name)}
              </p>
              <p className="text-muted-foreground">
                {options.isPending
                  ? "Loading campaign ads…"
                  : campaignAvailable
                    ? "Shows this campaign’s current approved ads. Ads returned to Studio leave this preview."
                    : "This campaign needs approved ads before you can share its preview."}
              </p>
            </div>
          ) : (
            <label className="block space-y-1.5 text-sm font-medium">
              Campaign
              <select
                className={selectClass}
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
              >
                <option value="">None</option>
                {campaigns.map((item) => (
                  <option key={item.id} value={item.id}>
                    {campaignDisplayName(item.name)} · {item.approved} approved
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block space-y-1.5 text-sm font-medium">
            Catalog export
            <select
              className={selectClass}
              value={catalogExportId}
              onChange={(event) => {
                setCatalogExportId(event.target.value);
                setSelectedCards([]);
                setCatalogMode("all");
              }}
            >
              <option value="">None</option>
              {exports.map((row) => (
                <option key={row.id} value={row.id}>
                  {new Date(row.createdAt).toLocaleString()} ·{" "}
                  {row.cards.length} homes
                </option>
              ))}
            </select>
          </label>
          {catalog && (
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium">
                Homes to include
              </legend>
              <div className="flex gap-4 text-sm">
                {(["all", "selected"] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="catalogMode"
                      checked={catalogMode === mode}
                      onChange={() => setCatalogMode(mode)}
                    />
                    {mode === "all"
                      ? `All ${catalog.cards.length} homes`
                      : "Choose homes"}
                  </label>
                ))}
              </div>
              {catalogMode === "selected" && (
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
                  {catalog.cards.map((card) => (
                    <label
                      key={card.index}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCards.includes(card.index)}
                        onChange={(event) =>
                          setSelectedCards((current) =>
                            event.target.checked
                              ? [...current, card.index]
                              : current.filter((index) => index !== card.index),
                          )
                        }
                      />
                      {card.headline}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Catalog images and copy come from this saved export. Your
                selection also applies to PDF, PNG and the composed sheet.
              </p>
            </fieldset>
          )}
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
          {options.isError && (
            <p role="alert" className="text-sm text-destructive">
              Could not load preview options. Close and try again.
            </p>
          )}
          <Button
            type="submit"
            disabled={
              create.isPending ||
              options.isPending ||
              options.isError ||
              !campaignAvailable ||
              Boolean(
                catalogExportId &&
                catalogMode === "selected" &&
                !selectedCards.length,
              ) ||
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
