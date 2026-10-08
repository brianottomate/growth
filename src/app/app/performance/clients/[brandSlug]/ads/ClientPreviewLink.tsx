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
  // Null keeps the existing live preview of every approved campaign ad.
  const [selectedAdIds, setSelectedAdIds] = useState<string[] | null>(null);
  const [catalogExportId, setCatalogExportId] = useState("");
  const [selectedCards, setSelectedCards] = useState<number[] | null>(null);
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
  const selectedHomeCount =
    catalog?.cards.filter(
      (card) => selectedCards === null || selectedCards.includes(card.index),
    ).length ?? 0;
  const selectedCampaign = campaigns.find((row) => row.id === campaignId);
  const selectedAds =
    selectedCampaign?.ads.filter(
      (ad) => selectedAdIds === null || selectedAdIds.includes(ad.id),
    ) ?? [];
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
          setSelectedAdIds(null);
          setSelectedCards(null);
        }
      }}
      title={
        campaign
          ? `Client preview · ${campaignDisplayName(campaign.name)}`
          : "Client preview link"
      }
      size="lg"
      scrollable
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
              campaignAdIds: campaignId ? selectedAdIds : null,
              catalogExportId: catalogExportId || null,
              catalogCardIndexes: catalogExportId ? selectedCards : null,
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
                  : !campaignAvailable
                    ? "This campaign needs approved ads before you can share its preview."
                    : null}
              </p>
            </div>
          ) : (
            <label className="block space-y-1.5 text-sm font-medium">
              Campaign
              <select
                className={selectClass}
                value={campaignId}
                onChange={(event) => {
                  setCampaignId(event.target.value);
                  setSelectedAdIds(null);
                }}
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
          {selectedCampaign && (
            <details
              key={selectedCampaign.id}
              className="group rounded-md border p-3"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
                <span className="font-medium">
                  {selectedAdIds === null
                    ? `All ${selectedCampaign.ads.length} ads`
                    : `${selectedAds.length} of ${selectedCampaign.ads.length} ads`}
                </span>
                <span className="text-muted-foreground group-open:hidden">
                  Edit selection
                </span>
                <span className="hidden text-muted-foreground group-open:inline">
                  Done
                </span>
              </summary>
              <fieldset className="mt-3 space-y-3">
                <legend className="sr-only">Ads to include</legend>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-sm text-muted-foreground">
                    {selectedAds.length} of {selectedCampaign.ads.length}{" "}
                    selected
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedAdIds(null)}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedAdIds([])}
                  >
                    Deselect all
                  </Button>
                </div>
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
                  {selectedCampaign.ads.map((ad) => (
                    <label
                      key={ad.id}
                      className="flex cursor-pointer items-center gap-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={
                          selectedAdIds === null ||
                          selectedAdIds.includes(ad.id)
                        }
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedAdIds((current) => {
                            const ids =
                              current ??
                              selectedCampaign.ads.map((item) => item.id);
                            return checked
                              ? [...ids, ad.id]
                              : ids.filter((id) => id !== ad.id);
                          });
                        }}
                      />
                      {ad.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ad.thumbnail}
                          alt=""
                          className="size-14 shrink-0 rounded object-cover"
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block font-medium break-words">
                          {ad.name}
                        </span>
                        <span className="block text-xs break-words text-muted-foreground">
                          {ad.headline}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedAdIds === null
                    ? "Includes all current approved ads, including ads approved later."
                    : "Includes only the selected ads. Ads returned to Studio leave this preview."}
                </p>
                {!selectedAds.length && (
                  <p role="alert" className="text-xs text-destructive">
                    Select at least one ad.
                  </p>
                )}
              </fieldset>
            </details>
          )}
          <label className="block space-y-1.5 text-sm font-medium">
            Catalog export
            <select
              className={selectClass}
              value={catalogExportId}
              onChange={(event) => {
                setCatalogExportId(event.target.value);
                setSelectedCards(null);
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
            <details key={catalog.id} className="group rounded-md border p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
                <span className="font-medium">
                  {selectedCards === null
                    ? `All ${catalog.cards.length} homes`
                    : `${selectedHomeCount} of ${catalog.cards.length} homes`}
                </span>
                <span className="text-muted-foreground group-open:hidden">
                  Edit selection
                </span>
                <span className="hidden text-muted-foreground group-open:inline">
                  Done
                </span>
              </summary>
              <fieldset className="mt-3 space-y-3">
                <legend className="sr-only">Homes to include</legend>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-auto text-sm text-muted-foreground">
                      {selectedHomeCount} of {catalog.cards.length} selected
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedCards(null)}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedCards([])}
                    >
                      Deselect all
                    </Button>
                  </div>
                  <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
                    {catalog.cards.map((card) => (
                      <label
                        key={card.index}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={
                            selectedCards === null ||
                            selectedCards.includes(card.index)
                          }
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelectedCards((current) => {
                              const indexes =
                                current ??
                                catalog.cards.map((item) => item.index);
                              return checked
                                ? [...indexes, card.index]
                                : indexes.filter(
                                    (index) => index !== card.index,
                                  );
                            });
                          }}
                        />
                        {card.headline}
                      </label>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Catalog images and copy come from this saved export. Your
                  selection also applies to PDF, PNG and the composed sheet.
                </p>
                {!selectedHomeCount && (
                  <p role="alert" className="text-xs text-destructive">
                    Select at least one home.
                  </p>
                )}
              </fieldset>
            </details>
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
              Boolean(campaignId && !selectedAds.length) ||
              Boolean(catalogExportId && !selectedHomeCount) ||
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
