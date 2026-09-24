"use client";
import { catalogAddressIssues } from "@/lib/catalog-addresses";
import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import { COMPOSITION_FORMATS, COMPOSITION_TEMPLATES } from "@/lib/compositions";
import {
  catalogArtworkIssues,
  catalogCardCopy,
  type CatalogCard,
  type CatalogDraft,
  type CatalogHome,
  type CatalogExport,
} from "@/lib/catalog-studio";
import { amenityHeadlineOptions } from "@/lib/home-amenities";
import { place } from "@/lib/home-ad-previews";
import { sendAssistantIntent } from "@/lib/assistant-events";

async function readResponse<T = unknown>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Catalog request failed",
    );
  return body as T;
}
const PORTRAIT = COMPOSITION_FORMATS.find((f) => f.id === "portrait")!;
function preview(brandId: string, card: CatalogCard) {
  if (card.mode === "finished") return card.finishedArtwork?.url;
  const copy = catalogCardCopy(card);
  const params = new URLSearchParams({
    brandId,
    templateId: card.templateId,
    formatId: PORTRAIT.id,
    title: copy.title,
    subtitle: copy.subtitle,
    imagePosition: card.imagePosition,
    mark: card.showLogo ? "auto" : "none",
  });
  if (copy.eyebrow) params.set("eyebrow", copy.eyebrow);
  if (copy.rating) params.set("rating", String(copy.rating));
  params.set(
    card.assetId ? "sourceMediaAssetId" : "sourceUrl",
    card.assetId ?? card.imageUrl,
  );
  return `/api/compositions/preview?${params}`;
}
export function CatalogCards({
  brandId,
  brandName = "",
}: {
  brandId: string;
  brandName?: string;
}) {
  const client = useQueryClient();
  const url = `/api/performance/catalog/${brandId}/studio`;
  const query = useQuery<{
    enrichmentError?: string;
    homes: CatalogHome[];
    draft: CatalogDraft;
    exports: CatalogExport[];
  }>({
    queryKey: ["catalog-studio", brandId],
    queryFn: async () =>
      readResponse<{
        homes: CatalogHome[];
        draft: CatalogDraft;
        exports: CatalogExport[];
      }>(await fetch(url)),
    refetchInterval: (q) =>
      q.state.data?.exports.some((e) =>
        ["queued", "processing"].includes(e.status),
      )
        ? 2500
        : false,
  });
  const [view, setView] = useState<"studio" | "exports">("studio");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [details, setDetails] = useState<CatalogCard | null>(null);
  const [library, setLibrary] = useState(false);
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draft = query.data?.draft;
  const homes = query.data?.homes ?? [];
  const homeOf = (card: CatalogCard) => homes.find((h) => h.id === card.homeId);
  const reload = () =>
    client.invalidateQueries({ queryKey: ["catalog-studio", brandId] });
  // Chat edits the same rows; show its writes as they land.
  useEffect(() => {
    const onWrite = () =>
      void client.invalidateQueries({ queryKey: ["catalog-studio", brandId] });
    window.addEventListener("growth:write", onWrite);
    return () => window.removeEventListener("growth:write", onWrite);
  }, [client, brandId]);
  async function post(body: Record<string, unknown>, fallback: string) {
    setError("");
    try {
      const result = await readResponse(
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      await reload();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
      return null;
    }
  }
  const workInChat = (card: CatalogCard, focus?: "photo" | "copy") => {
    const homeName = homeOf(card)?.name ?? "this home";
    sendAssistantIntent({
      type: "work_catalog_home",
      brandId,
      brandName,
      homeId: card.homeId,
      homeName,
      focus,
      visibleText:
        focus === "photo"
          ? `Pick a better hero photo for ${homeName}`
          : focus === "copy"
            ? `Write a better catalog headline for ${homeName}`
            : `Let's work on ${homeName}'s catalog card`,
    });
  };
  async function setHero(card: CatalogCard, photoUrl: string) {
    const done = await post(
      { action: "hero", homeId: card.homeId, url: photoUrl },
      "Unable to set the hero",
    );
    if (done)
      setDetails((d) =>
        d?.homeId === card.homeId
          ? { ...d, imageUrl: photoUrl, assetId: undefined }
          : d,
      );
  }
  /** Save what changed on one card to its home's row. */
  const update = (next: CatalogCard) => {
    const prev = draft?.cards.find((c) => c.homeId === next.homeId);
    if (!prev) return;
    const patch = cardPatch(prev, next);
    if (Object.keys(patch).length)
      void post(
        { action: "card", homeId: next.homeId, patch },
        "Unable to save the card",
      );
  };
  async function run(action: "export" | "refresh") {
    setBusy(true);
    const done = await post(
      { action },
      action === "export" ? "Unable to export" : "Unable to refresh homes",
    );
    if (done && action === "export") setView("exports");
    setBusy(false);
  }
  const activeExport = query.data?.exports.some((e) =>
    ["queued", "processing"].includes(e.status),
  );
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Catalog</h2>
          <p className="text-sm text-muted-foreground">
            One card per home. Review, then save a frozen export to your media
            library.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === "studio" ? "secondary" : "ghost"}
            onClick={() => setView("studio")}
          >
            Studio
          </Button>
          <Button
            variant={view === "exports" ? "secondary" : "ghost"}
            onClick={() => setView("exports")}
          >
            Exports {query.data?.exports.length || ""}
          </Button>
        </div>
      </div>
      {(error || query.error) && (
        <p role="alert" className="text-destructive">
          {error || query.error?.message}
        </p>
      )}
      {query.data?.enrichmentError && (
        <p className="text-sm text-muted-foreground">
          {query.data.enrichmentError}
        </p>
      )}
      {query.isLoading && <p>Loading homes…</p>}
      {view === "studio" && draft && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {draft.cards.filter((c) => c.included).length} of{" "}
              {draft.cards.length} homes included
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run("refresh")}
              >
                Refresh homes
              </Button>
              <Button
                disabled={
                  busy ||
                  activeExport ||
                  !draft.cards.some((c) => c.included) ||
                  catalogArtworkIssues(draft).length > 0
                }
                onClick={() => void run("export")}
              >
                {busy ? "Working…" : "Create export"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex rounded-lg border p-0.5">
              {(["grid", "list"] as const).map((l) => (
                <Button
                  key={l}
                  variant={layout === l ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={layout === l}
                  onClick={() => {
                    setLayout(l);
                    setDetails(null);
                  }}
                >
                  {l === "grid" ? "Compact" : "List"}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void post(
                  { action: "includeAll", included: true },
                  "Unable to update the catalog",
                )
              }
            >
              Include all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void post(
                  { action: "includeAll", included: false },
                  "Unable to update the catalog",
                )
              }
            >
              Exclude all
            </Button>
          </div>
          {catalogArtworkIssues(draft).length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {catalogArtworkIssues(draft).join(" · ")}
            </p>
          )}
          {!draft.cards.length && (
            <p className="text-muted-foreground">
              No homes with photos found on this brand’s WanderOS site.
            </p>
          )}
          {layout === "grid" ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {draft.cards.slice(0, limit).map((card) => (
                <div
                  key={card.homeId}
                  className={`overflow-hidden rounded-xl border bg-card ${card.included ? "" : "opacity-50"}`}
                >
                  <button
                    className="block w-full"
                    onClick={() => setDetails({ ...card })}
                    aria-label={`Edit ${homeOf(card)?.name}`}
                  >
                    <CardPreview brandId={brandId} card={card} />
                  </button>
                  {card.mode === "finished" && (
                    <p className="px-3 pt-2 text-xs text-muted-foreground">
                      Finished artwork
                      {card.finishedArtwork ? "" : " · Choose image"}
                    </p>
                  )}
                  <div className="flex items-start gap-2 p-3">
                    <input
                      type="checkbox"
                      aria-label={`Include ${homeOf(card)?.name}`}
                      checked={card.included}
                      onChange={(e) =>
                        update({ ...card, included: e.target.checked })
                      }
                    />
                    <button
                      className="text-left text-sm"
                      onClick={() => setDetails({ ...card })}
                    >
                      {homeOf(card)?.name}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {draft.cards.slice(0, limit).map((card) => {
                const editing = details?.homeId === card.homeId;
                const shown = editing ? details : card;
                return (
                  <section
                    key={card.homeId}
                    aria-label={homeOf(card)?.name}
                    className={`rounded-lg border p-4 ${card.included || editing ? "" : "opacity-50"}`}
                  >
                    <div className="grid items-start gap-5 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
                      <div className="flex justify-center rounded-lg bg-muted p-3">
                        <div className="w-full max-w-xs overflow-hidden rounded-md">
                          <CardPreview brandId={brandId} card={shown} />
                        </div>
                      </div>
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={card.included}
                              onChange={(e) =>
                                update({ ...card, included: e.target.checked })
                              }
                            />
                            {homeOf(card)?.name}
                          </label>
                          {!editing && (
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => workInChat(card, "photo")}
                              >
                                New photo
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => workInChat(card, "copy")}
                              >
                                New copy
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => workInChat(card)}
                              >
                                <MessageSquare className="size-3.5" />
                                Work in chat
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDetails({ ...card })}
                              >
                                Edit
                              </Button>
                            </div>
                          )}
                        </div>
                        {editing ? (
                          <CardEditor
                            card={details}
                            home={homeOf(card)}
                            onChange={setDetails}
                            onHero={(photoUrl) =>
                              void setHero(details, photoUrl)
                            }
                            onLibrary={() => setLibrary(true)}
                            onApply={() => {
                              update({ ...details, included: card.included });
                              setDetails(null);
                            }}
                            onCancel={() => setDetails(null)}
                          />
                        ) : card.mode === "finished" ? (
                          <p className="text-sm text-muted-foreground">
                            Finished artwork, with no added text or logo.
                          </p>
                        ) : (
                          <dl className="space-y-3 text-sm">
                            {[
                              ["Headline", card.title],
                              ["Facts", card.subtitle],
                              [
                                "Composition",
                                COMPOSITION_TEMPLATES.find(
                                  (t) => t.id === card.templateId,
                                )?.label ?? card.templateId,
                              ],
                            ].map(([label, value]) => (
                              <div key={label}>
                                <dt className="text-xs text-muted-foreground">
                                  {label}
                                </dt>
                                <dd className="break-words">
                                  {value || "Not set"}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          {limit < draft.cards.length && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setLimit(limit + 10)}>
                Load more homes
              </Button>
              <Button
                variant="outline"
                onClick={() => setLimit(draft.cards.length)}
              >
                Load all homes
              </Button>
            </div>
          )}
        </>
      )}
      {view === "exports" && (
        <div className="space-y-5">
          {!query.data?.exports.length && (
            <p className="text-muted-foreground">
              No exports yet. Review the Studio cards and create your first
              export.
            </p>
          )}
          {query.data?.exports.map((item) => (
            <article key={item.id} className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">
                    {new Date(item.createdAt).toLocaleString()}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {item.status === "ready"
                      ? `${item.rows?.length} homes · ${item.assets?.length} images`
                      : item.status === "error"
                        ? "Export failed"
                        : `Rendering ${item.completed ?? 0} of ${item.total ?? 0} images…`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  {item.status === "ready" &&
                    ["csv", "xlsx"].map((type) => (
                      <a
                        className="underline"
                        key={type}
                        href={`/api/performance/catalog/${brandId}/exports/${item.id}?format=${type}`}
                      >
                        Download {type.toUpperCase()}
                      </a>
                    ))}
                  {item.folderId && (
                    <a
                      className="underline"
                      href={`/app/media?brand=${brandId}&folder=${item.folderId}`}
                    >
                      Open in media library
                    </a>
                  )}
                </div>
              </div>
              {item.error && (
                <p role="alert" className="text-destructive">
                  {item.error}
                </p>
              )}
              {item.status === "ready" && (
                <p className="text-xs text-muted-foreground">
                  {catalogAddressIssues(item.rows ?? []).length
                    ? catalogAddressIssues(item.rows ?? []).join(" · ")
                    : "Addresses and coordinates saved with this export."}
                </p>
              )}
              <div className="flex gap-3 overflow-x-auto">
                {item.assets?.map((a) => (
                  <a
                    key={a.assetId}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-32 shrink-0"
                  >
                    <img
                      src={a.url}
                      alt={`${a.name} · ${a.format}`}
                      loading="lazy"
                      className="h-40 w-32 rounded bg-muted object-contain"
                    />
                    <p className="mt-1 text-xs">
                      {a.name} · {a.format}
                    </p>
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog
        open={layout === "grid" && !!details}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{details && homeOf(details)?.name}</DialogTitle>
            <DialogDescription>
              Edit the catalog artwork. Listing facts stay unchanged.
            </DialogDescription>
          </DialogHeader>
          {details && (
            <div className="grid gap-6 md:grid-cols-2">
              <CardPreview brandId={brandId} card={details} />
              <CardEditor
                card={details}
                home={homeOf(details)}
                onChange={setDetails}
                onHero={(photoUrl) => void setHero(details, photoUrl)}
                onLibrary={() => setLibrary(true)}
                onApply={() => {
                  update(details);
                  setDetails(null);
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <MediaPickerDialog
        brandId={brandId}
        open={library}
        onOpenChange={setLibrary}
        existingAssetIds={[]}
        onPick={(item) => {
          if (details && item.type === "image" && item.assetId) {
            setDetails(
              details.mode === "finished"
                ? {
                    ...details,
                    finishedArtwork: {
                      assetId: item.assetId,
                      url: item.url,
                      format: "portrait",
                    },
                  }
                : { ...details, imageUrl: item.url, assetId: item.assetId },
            );
            setLibrary(false);
          }
        }}
      />
    </section>
  );
}

function CardPreview({
  brandId,
  card,
}: {
  brandId: string;
  card: CatalogCard;
}) {
  const src =
    card.mode === "finished" || card.title.trim()
      ? preview(brandId, card)
      : undefined;
  const empty =
    card.mode === "finished" ? "Choose finished artwork" : "Add a headline";
  return (
    <PreviewImage key={src ?? empty} src={src} alt={card.title} empty={empty} />
  );
}

function PreviewImage({
  src,
  alt,
  empty,
}: {
  src: string | undefined;
  alt: string;
  empty: string;
}) {
  const [failed, setFailed] = useState(false);
  const aspectRatio = `${PORTRAIT.width}/${PORTRAIT.height}`;
  if (!src || failed)
    return (
      <div
        className="flex w-full items-center justify-center rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground"
        style={{ aspectRatio }}
      >
        {src ? "Preview unavailable" : empty}
      </div>
    );
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="w-full rounded-lg object-contain"
      style={{ aspectRatio }}
      onError={() => setFailed(true)}
    />
  );
}

function CardEditor({
  card,
  home,
  onChange,
  onHero,
  onLibrary,
  onApply,
  onCancel,
}: {
  card: CatalogCard;
  home: CatalogHome | undefined;
  onChange: (card: CatalogCard) => void;
  /** Make a photo the home's hero, which every surface draws on. */
  onHero: (photoUrl: string) => void;
  onLibrary: () => void;
  onApply: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="space-y-4">
      <label className="block space-y-1 text-sm">
        Artwork
        <select
          className="block w-full rounded border bg-background p-2"
          value={card.mode ?? "compose"}
          onChange={(e) =>
            onChange({
              ...card,
              mode: e.target.value as "compose" | "finished",
            })
          }
        >
          <option value="compose">Compose</option>
          <option value="finished">Finished artwork</option>
        </select>
      </label>
      {card.mode === "finished" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Use the original image as-is. Text and branding are already part of
            the image. Your composition is kept if you switch back.
          </p>
          <Button variant="outline" onClick={onLibrary}>
            Choose finished artwork
          </Button>
        </div>
      ) : (
        <>
          <label className="block space-y-1 text-sm">
            Headline
            <Input
              value={card.title}
              maxLength={120}
              onChange={(e) => onChange({ ...card, title: e.target.value })}
            />
          </label>
          {home && (
            <div className="flex flex-wrap gap-1.5">
              {amenityHeadlineOptions(home.amenities, place(home)).map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onChange({ ...card, title: option })}
                    className={`rounded-full border px-2.5 py-1 text-xs ${option === card.title ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {option}
                  </button>
                ),
              )}
            </div>
          )}
          <label className="block space-y-1 text-sm">
            Facts
            <Input
              value={card.subtitle}
              maxLength={220}
              onChange={(e) => onChange({ ...card, subtitle: e.target.value })}
            />
          </label>
          <label className="block space-y-1 text-sm">
            Composition
            <select
              className="block w-full rounded border bg-background p-2"
              value={card.templateId}
              onChange={(e) =>
                onChange({
                  ...card,
                  templateId: e.target.value as CatalogCard["templateId"],
                })
              }
            >
              {COMPOSITION_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Crop focus
            <select
              className="ml-2 rounded border bg-background p-2"
              value={card.imagePosition}
              onChange={(e) =>
                onChange({
                  ...card,
                  imagePosition: e.target.value as CatalogCard["imagePosition"],
                })
              }
            >
              {["top", "center", "bottom"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={card.showLogo}
              onChange={(e) =>
                onChange({ ...card, showLogo: e.target.checked })
              }
            />
            Include brand logo
          </label>
          <Button variant="outline" onClick={onLibrary}>
            Choose from library or upload
          </Button>
          <div>
            <p className="mb-2 text-sm">Hero photo for this home</p>
            <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">
              {home?.gallery?.map((photo) => (
                <button
                  key={photo.url}
                  aria-label="Make this the hero photo"
                  aria-pressed={!card.assetId && photo.url === card.imageUrl}
                  onClick={() => onHero(photo.url)}
                >
                  <img
                    src={photo.thumbUrl}
                    alt="Home photo"
                    className={`aspect-square w-full rounded object-cover ${!card.assetId && photo.url === card.imageUrl ? "ring-2 ring-foreground" : ""}`}
                  />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="flex gap-2">
        <Button
          disabled={
            !card.title.trim() ||
            (card.mode === "finished" && !card.finishedArtwork)
          }
          onClick={onApply}
        >
          Apply changes
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

/** The row fields a card edit changes; null puts one back on its default. */
function cardPatch(prev: CatalogCard, next: CatalogCard) {
  const patch: Record<string, unknown> = {};
  for (const key of [
    "title",
    "subtitle",
    "templateId",
    "imagePosition",
    "showLogo",
    "included",
  ] as const)
    if (prev[key] !== next[key]) patch[key] = next[key];
  if ((prev.mode ?? "compose") !== (next.mode ?? "compose"))
    patch.mode = next.mode ?? null;
  if (prev.assetId !== next.assetId) patch.imageAssetId = next.assetId ?? null;
  if (prev.finishedArtwork?.assetId !== next.finishedArtwork?.assetId)
    patch.finishedAssetId = next.finishedArtwork?.assetId ?? null;
  return patch;
}
