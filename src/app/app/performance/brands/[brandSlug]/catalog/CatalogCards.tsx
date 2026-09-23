"use client";
import { catalogAddressIssues } from "@/lib/catalog-addresses";
import { useState } from "react";
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
import {
  COMPOSITION_FORMATS,
  COMPOSITION_TEMPLATES,
  type CompositionFormatId,
} from "@/lib/compositions";
import {
  catalogArtworkIssues,
  type CatalogCard,
  type CatalogDraft,
  type CatalogHome,
  type CatalogExport,
} from "@/lib/catalog-studio";

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
function preview(
  brandId: string,
  card: CatalogCard,
  format: CompositionFormatId,
) {
  if (card.mode === "finished") return card.finishedArtwork?.url;
  const params = new URLSearchParams({
    brandId,
    templateId: card.templateId,
    formatId: format,
    title: card.title,
    subtitle: card.subtitle,
    imagePosition: card.imagePosition,
    mark: card.showLogo ? "auto" : "none",
  });
  params.set(
    card.assetId ? "sourceMediaAssetId" : "sourceUrl",
    card.assetId ?? card.imageUrl,
  );
  return `/api/compositions/preview?${params}`;
}
export function CatalogCards({ brandId }: { brandId: string }) {
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
  const [edited, setEdited] = useState<CatalogDraft | null>(null);
  const [view, setView] = useState<"studio" | "exports">("studio");
  const [format, setFormat] = useState<CompositionFormatId>("portrait");
  const [details, setDetails] = useState<CatalogCard | null>(null);
  const [library, setLibrary] = useState(false);
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draft = edited ?? query.data?.draft;
  const homes = query.data?.homes ?? [];
  const selectedHome = homes.find((h) => h.id === details?.homeId);
  const update = (card: CatalogCard) =>
    setEdited({
      ...draft!,
      cards: draft!.cards.map((c) => (c.homeId === card.homeId ? card : c)),
    });
  async function save(action: "save" | "export" | "refresh") {
    setBusy(true);
    setError("");
    try {
      await readResponse(
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, draft }),
        }),
      );
      await client.invalidateQueries({ queryKey: ["catalog-studio", brandId] });
      if (action !== "refresh") setEdited(null);
      if (action === "export") setView("exports");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
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
              {draft.cards.length} homes included{" "}
              {edited && "· Unsaved changes"}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy || !edited}
                onClick={() => void save("save")}
              >
                Save draft
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void save("refresh")}
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
                onClick={() => void save("export")}
              >
                {busy ? "Saving…" : "Create export"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {COMPOSITION_FORMATS.filter((f) =>
              ["portrait", "square", "story", "wide"].includes(f.id),
            ).map((f) => (
              <div
                key={f.id}
                className={`flex items-center rounded-lg border ${format === f.id ? "border-primary bg-accent" : ""}`}
              >
                <button
                  type="button"
                  className="px-3 py-2 text-sm"
                  onClick={() => setFormat(f.id)}
                  aria-pressed={format === f.id}
                >
                  {f.label} ·{" "}
                  {f.id === "portrait"
                    ? "4:5"
                    : f.id === "square"
                      ? "1:1"
                      : f.id === "story"
                        ? "9:16"
                        : "16:9"}
                </button>
                <input
                  type="checkbox"
                  className="mr-3"
                  aria-label={`Include ${f.label} in export`}
                  checked={draft.formats.includes(f.id)}
                  onChange={(e) => {
                    const formats = e.target.checked
                      ? [...draft.formats, f.id]
                      : draft.formats.filter((x) => x !== f.id);
                    if (formats.length)
                      setEdited({
                        ...draft,
                        formats,
                        primaryFormat: formats.includes(draft.primaryFormat)
                          ? draft.primaryFormat
                          : formats[0]!,
                      });
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              Click a size to preview; check it to export.
            </span>
            <label>
              Feed image{" "}
              <select
                className="rounded border bg-background p-1"
                value={draft.primaryFormat}
                onChange={(e) =>
                  setEdited({
                    ...draft,
                    primaryFormat: e.target.value as CompositionFormatId,
                  })
                }
              >
                {draft.formats.map((f) => (
                  <option key={f} value={f}>
                    {COMPOSITION_FORMATS.find((x) => x.id === f)?.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setEdited({
                  ...draft,
                  cards: draft.cards.map((c) => ({ ...c, included: true })),
                })
              }
            >
              Include all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setEdited({
                  ...draft,
                  cards: draft.cards.map((c) => ({ ...c, included: false })),
                })
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {draft.cards.slice(0, limit).map((card) => (
              <div
                key={card.homeId}
                className={`overflow-hidden rounded-xl border bg-card ${card.included ? "" : "opacity-50"}`}
              >
                <button
                  className="block w-full"
                  onClick={() => setDetails({ ...card })}
                  aria-label={`Edit ${homes.find((h) => h.id === card.homeId)?.name}`}
                >
                  <img
                    src={preview(brandId, card, format)}
                    alt={card.title}
                    loading="lazy"
                    className="w-full object-contain"
                    style={{
                      aspectRatio: `${COMPOSITION_FORMATS.find((f) => f.id === format)!.width}/${COMPOSITION_FORMATS.find((f) => f.id === format)!.height}`,
                    }}
                  />
                </button>
                {card.mode === "finished" && (
                  <p className="px-3 pt-2 text-xs text-muted-foreground">
                    Finished artwork ·{" "}
                    {card.finishedArtwork?.format ?? "Choose image"}
                  </p>
                )}
                <div className="flex items-start gap-2 p-3">
                  <input
                    type="checkbox"
                    aria-label={`Include ${homes.find((h) => h.id === card.homeId)?.name}`}
                    checked={card.included}
                    onChange={(e) =>
                      update({ ...card, included: e.target.checked })
                    }
                  />
                  <button
                    className="text-left text-sm"
                    onClick={() => setDetails({ ...card })}
                  >
                    {homes.find((h) => h.id === card.homeId)?.name}
                  </button>
                </div>
              </div>
            ))}
          </div>
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
        open={!!details}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedHome?.name}</DialogTitle>
            <DialogDescription>
              Edit the catalog artwork. Listing facts stay unchanged.
            </DialogDescription>
          </DialogHeader>
          {details && (
            <div className="grid gap-6 md:grid-cols-2">
              <img
                src={preview(brandId, details, format)}
                alt={details.title}
                className="w-full rounded-lg"
              />
              <div className="space-y-4">
                <label className="block space-y-1 text-sm">
                  Artwork
                  <select
                    className="block w-full rounded border bg-background p-2"
                    value={details.mode ?? "compose"}
                    onChange={(e) =>
                      setDetails({
                        ...details,
                        mode: e.target.value as "compose" | "finished",
                      })
                    }
                  >
                    <option value="compose">Compose</option>
                    <option value="finished">Finished artwork</option>
                  </select>
                </label>
                {details.mode === "finished" ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Use the original image as-is. Text and branding are
                      already part of the image. Your composition is kept if you
                      switch back.
                    </p>
                    <label className="block text-sm">
                      Artwork size
                      <select
                        className="ml-2 rounded border bg-background p-2"
                        value={details.finishedArtwork?.format ?? format}
                        onChange={(e) => {
                          if (details.finishedArtwork)
                            setDetails({
                              ...details,
                              finishedArtwork: {
                                ...details.finishedArtwork,
                                format: e.target.value as CompositionFormatId,
                              },
                            });
                        }}
                      >
                        {COMPOSITION_FORMATS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button variant="outline" onClick={() => setLibrary(true)}>
                      Choose finished artwork
                    </Button>
                  </div>
                ) : (
                  <>
                    <label className="block space-y-1 text-sm">
                      Headline
                      <Input
                        value={details.title}
                        maxLength={120}
                        onChange={(e) =>
                          setDetails({ ...details, title: e.target.value })
                        }
                      />
                    </label>
                    <label className="block space-y-1 text-sm">
                      Facts
                      <Input
                        value={details.subtitle}
                        maxLength={220}
                        onChange={(e) =>
                          setDetails({ ...details, subtitle: e.target.value })
                        }
                      />
                    </label>
                    <label className="block space-y-1 text-sm">
                      Composition
                      <select
                        className="block w-full rounded border bg-background p-2"
                        value={details.templateId}
                        onChange={(e) =>
                          setDetails({
                            ...details,
                            templateId: e.target
                              .value as CatalogCard["templateId"],
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
                        value={details.imagePosition}
                        onChange={(e) =>
                          setDetails({
                            ...details,
                            imagePosition: e.target
                              .value as CatalogCard["imagePosition"],
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
                        checked={details.showLogo}
                        onChange={(e) =>
                          setDetails({ ...details, showLogo: e.target.checked })
                        }
                      />
                      Include brand logo
                    </label>
                    <Button variant="outline" onClick={() => setLibrary(true)}>
                      Choose from library or upload
                    </Button>
                    <div>
                      <p className="mb-2 text-sm">Choose from this home</p>
                      <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">
                        {selectedHome?.gallery?.map((photo) => (
                          <button
                            key={photo.url}
                            aria-label="Use home photo"
                            onClick={() =>
                              setDetails({
                                ...details,
                                imageUrl: photo.url,
                                assetId: undefined,
                              })
                            }
                          >
                            <img
                              src={photo.thumbUrl}
                              alt="Home photo"
                              className="aspect-square w-full rounded object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <Button
                  disabled={
                    !details.title.trim() ||
                    (details.mode === "finished" && !details.finishedArtwork)
                  }
                  onClick={() => {
                    update(details);
                    setDetails(null);
                  }}
                >
                  Apply changes
                </Button>
              </div>
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
                      format: details.finishedArtwork?.format ?? format,
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
