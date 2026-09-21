"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { META_PLACEMENTS } from "@/lib/meta-placement-plan";
import { ideaSource } from "@/lib/ad-idea-studio";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DeleteAlert } from "@/components/ui/alert-dialog";
import { AdIdeaPreview } from "./AdIdeaPreview";
import { AdIdeaSlideRow } from "./AdIdeaSlideRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dropzone } from "@/components/ui/dropzone";
import { toast } from "@/components/ui/toast";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import { useMediaUpload } from "@/app/app/media/use-media-upload";
import { useTRPC } from "@/trpc/react";
import {
  IDEA_SHAPES,
  IDEA_SHAPE_LABELS,
  defaultIdeaRecipe,
  ideaDocumentFromAd,
  withIdeaPool,
  sameIdeaSource,
} from "@/lib/ad-idea-studio";
import type {
  IdeaDocument,
  IdeaImage,
  IdeaShape,
  IdeaSource,
} from "@/lib/ad-idea-studio";
import type { AdCreativeContent, MediaItem } from "@/server/db/schema";

export type StudioAd = {
  id: string;
  name: string;
  content: AdCreativeContent;
  updatedAt: string;
  homeId?: string | null;
};

export function AdIdeaCard({
  ad,
  brandId,
  brandName,
  brandLogo,
  deliveryState,
}: {
  ad: StudioAd;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  deliveryState?: string;
}) {
  const router = useRouter();
  const approved = Boolean(ad.content.ideaStudio?.approval);
  const [view, setView] = useState<"overview" | "details" | "platform">(() =>
    !approved && ideaDocumentFromAd(ad).cards.length === 0
      ? "details"
      : "overview",
  );
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [exportShapes, setExportShapes] = useState<IdeaShape[]>([]);
  const [approvalVersion, setApprovalVersion] = useState(ad.updatedAt);
  useEffect(() => {
    const prepare = (event: Event) => {
      const detail = (event as CustomEvent<{ adId: string; shape: IdeaShape }>)
        .detail;
      if (detail.adId === ad.id) {
        setView("details");
        setShape(detail.shape);
      }
    };
    window.addEventListener("prepare-ad-creative", prepare);
    return () => window.removeEventListener("prepare-ad-creative", prepare);
  }, [ad.id]);
  const collapsed = view === "overview";
  const trpc = useTRPC();
  const approval = useMutation(
    trpc.ads.setAdStatus.mutationOptions({
      onSuccess: () => {
        toast.success(
          approved ? "Ad reopened" : "Ad approved and creative saved",
        );
        setApprovalOpen(false);
        setView("overview");
        router.refresh();
      },
      onError: (error) => {
        toast.error(error.message);
        router.refresh();
      },
    }),
  );
  const [document, setDocument] = useState(() => ideaDocumentFromAd(ad));
  const [name, setName] = useState(ad.name);
  const [version, setVersion] = useState(ad.updatedAt);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    "copy" | "slide" | "pool" | "placements" | null
  >(null);
  const [showPool, setShowPool] = useState(false);
  const [savedState, setSavedState] = useState(() => ({
    document: ideaDocumentFromAd(ad),
    name: ad.name,
    version: ad.updatedAt,
  }));
  const [shape, setShape] = useState<IdeaShape>("portrait");
  const [homePickerOpen, setHomePickerOpen] = useState(false);
  const homeGallery = useQuery({
    ...trpc.ads.adIdeaHomePhotos.queryOptions({ adId: ad.id }),
    enabled: homePickerOpen && Boolean(ad.homeId),
  });
  const [poolTarget, setPoolTarget] = useState<"slide" | "size">("slide");
  const [picker, setPicker] = useState<"add" | "replace" | null>(null);
  const { uploadFiles, uploading, progress } = useMediaUpload(brandId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useMutation(
    trpc.ads.deleteAd.mutationOptions({
      onSuccess: () => {
        setDeleteOpen(false);
        toast.success("Ad idea deleted");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const save = useMutation(
    trpc.ads.saveIdea.mutationOptions({
      onSuccess: (saved) => {
        setVersion(saved.updatedAt.toISOString());
        const nextDocument = ideaDocumentFromAd({
          ...ad,
          content: saved.content as AdCreativeContent,
        });
        setSavedState({
          document: nextDocument,
          name: saved.name,
          version: saved.updatedAt.toISOString(),
        });
        setDocument(nextDocument);
        setName(saved.name);
        setEditor(null);
        setDirty(false);
        toast.success("Ad idea saved");
        router.refresh();
      },
      onError: (error) => {
        toast.error(error.message);
        router.refresh();
      },
    }),
  );
  const receivedVersion = useRef(ad.updatedAt);
  useEffect(() => {
    if (receivedVersion.current === ad.updatedAt) return;
    receivedVersion.current = ad.updatedAt;
    setSavedState({
      document: ideaDocumentFromAd(ad),
      name: ad.name,
      version: ad.updatedAt,
    });
  }, [ad]);
  const openEditor = (
    kind: "copy" | "slide" | "pool" | "placements",
    id: string | null = null,
  ) => {
    setDocument(savedState.document);
    setName(savedState.name);
    setVersion(savedState.version);
    setDirty(false);
    setSelectedId(id);
    setPoolTarget("slide");
    setShowPool(kind === "pool");
    setEditor(kind);
  };
  const stale = editor !== null && version !== savedState.version;
  const persist = (
    next: IdeaDocument,
    nextName = savedState.name,
    expectedVersion = savedState.version,
  ) =>
    save.mutate({
      adId: ad.id,
      expectedUpdatedAt: expectedVersion,
      name: nextName,
      document: withIdeaPool(next),
    });
  const edit = (fn: (current: IdeaDocument) => IdeaDocument) => {
    setDocument((current) => withIdeaPool(fn(withIdeaPool(current))));
    setDirty(true);
  };
  const card =
    document.cards.find((c) => c.id === selectedId) ??
    (document.role === "hero_static" ? document.cards[0] : undefined);
  const isStatic = savedState.document.role === "hero_static";
  const limit = isStatic ? 1 : 10;
  const busy = save.isPending || remove.isPending || uploading > 0;
  const updateCardById = (id: string, fn: (current: IdeaImage) => IdeaImage) =>
    edit((d) => ({
      ...d,
      cards: d.cards.map((c) => (c.id === id ? fn(c) : c)),
    }));
  const attach = (
    items: MediaItem[],
    mode: "add" | "replace",
    targetId = selectedId,
    targetShape = shape,
  ) => {
    const images = items.filter((item) => item.type === "image");
    if (images.length !== items.length)
      toast.error("Choose a still image for this ad idea");
    if (!images.length) return;
    edit((current) => {
      const d = withIdeaPool(
        current,
        images.map((item) => ({ url: item.url, assetId: item.assetId })),
      );
      const next = [...d.cards];
      const selected = next.findIndex((c) => c.id === targetId);
      for (const [index, item] of (mode === "replace"
        ? images.slice(0, 1)
        : images
      ).entries()) {
        const source = { assetId: item.assetId, url: item.url };
        if (mode === "replace" && index === 0 && next[selected])
          next[selected] = {
            ...next[selected],
            sourceOverrides: {
              ...next[selected].sourceOverrides,
              [targetShape]: source,
            },
          };
        else if (
          mode === "add" &&
          next.length < limit &&
          !next.some((card) => sameIdeaSource(card.source, source))
        )
          next.push({
            id: crypto.randomUUID(),
            source,
            mode: "supplied",
            recipe: defaultIdeaRecipe(d.role),
            overrides: {},
          });
      }
      return { ...d, cards: next };
    });
  };
  const choosePoolImage = (source: IdeaSource) => {
    if (poolTarget === "size" && card) {
      updateCardById(card.id, (c) => ({
        ...c,
        sourceOverrides: { ...c.sourceOverrides, [shape]: source },
      }));
    } else if (isStatic && card) {
      updateCardById(card.id, (c) => ({ ...c, source }));
    } else {
      attach([{ ...source, type: "image" }], "add");
    }
  };
  const move = (id: string, direction: number) => {
    const d = savedState.document;
    const selected = d.cards.findIndex((c) => c.id === id);
    const target = selected + direction;
    if (selected < 0 || target < 0 || target >= d.cards.length) return;
    const cards = [...d.cards];
    [cards[selected], cards[target]] = [cards[target]!, cards[selected]!];
    persist({ ...d, cards });
  };
  const renderSlide = (slide: IdeaImage, index: number, editing: boolean) => (
    <AdIdeaSlideRow
      key={slide.id}
      card={slide}
      brandId={brandId}
      name={savedState.name}
      shape={shape}
      index={index}
      count={savedState.document.cards.length}
      isStatic={isStatic}
      uploading={uploading}
      progress={progress}
      editing={editing}
      frozenUrl={
        approved
          ? (ad.content.ideaStudio?.approval?.renders[shape]?.[index]?.url ??
            null)
          : undefined
      }
      onEdit={() => openEditor("slide", slide.id)}
      onChange={(fn) => updateCardById(slide.id, fn)}
      onReplace={() => setPicker("replace")}
      onUpload={async (files) =>
        attach(await uploadFiles(files), "replace", slide.id, shape)
      }
      onMove={(direction) => move(slide.id, direction)}
      onRemove={() =>
        persist({
          ...savedState.document,
          cards: savedState.document.cards.filter((c) => c.id !== slide.id),
        })
      }
      onChoosePool={() => {
        setPoolTarget("size");
        setShowPool(true);
      }}
    />
  );

  return (
    <article
      id={`ad-${ad.id}`}
      className="space-y-5 rounded-xl border bg-card p-5"
      aria-label={ad.name}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-medium">{savedState.name}</h3>
          <span className="text-xs text-muted-foreground">
            {isStatic ? "Static" : "Carousel"} ·{" "}
            {savedState.document.cards.length} {isStatic ? "image" : "slides"}
          </span>
          {save.isPending && (
            <span className="text-xs text-muted-foreground">Saving…</span>
          )}
          <span className="text-xs text-muted-foreground">
            {approved ? "Approved · frozen creative" : "Draft idea"}
            {deliveryState ? ` · ${deliveryState}` : ""}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={!collapsed}
            onClick={() => setView(collapsed ? "details" : "overview")}
          >
            {collapsed ? "Expand" : "Collapse"}
          </Button>
          <Button
            size="sm"
            variant={approved ? "outline" : "default"}
            disabled={busy || approval.isPending || editor !== null}
            onClick={() =>
              approved
                ? approval.mutate({
                    adId: ad.id,
                    status: approved ? "drawn" : "approved",
                    expectedUpdatedAt: savedState.version,
                  })
                : (() => {
                    setExportShapes([...savedState.document.shapes]);
                    setApprovalVersion(savedState.version);
                    setApprovalOpen(true);
                  })()
            }
          >
            {approval.isPending
              ? "Working…"
              : approved
                ? "Reopen idea"
                : "Approve & save creative"}
          </Button>
        </div>
      </div>
      {ad.content.metaImport && (
        <Dialog>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Imported from Meta</span>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost">
                {ad.content.metaImport.issues.length
                  ? "Review import"
                  : "Source details"}
              </Button>
            </DialogTrigger>
          </div>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Imported creative</DialogTitle>
              <DialogDescription>
                Review the recovered artwork and copy before reusing this ad.
                Source data is kept for reference.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 pt-3">
              <p>
                Meta ad {ad.content.metaImport.adId}. Original composition
                layers are not available.
              </p>
              <details>
                <summary className="cursor-pointer">
                  Original Meta creative data
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto text-xs break-all whitespace-pre-wrap">
                  {JSON.stringify(ad.content.metaImport.rawCreative, null, 2)}
                </pre>
              </details>
              {ad.content.metaImport.issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
              {ad.content.metaImport.issues.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || approved}
                  onClick={() =>
                    save.mutate({
                      adId: ad.id,
                      expectedUpdatedAt: savedState.version,
                      name: savedState.name,
                      document: savedState.document,
                      reviewImportedCreative: true,
                    })
                  }
                >
                  Mark artwork and copy reviewed
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      <Dialog
        open={approvalOpen}
        onOpenChange={(open) => {
          if (!approval.isPending) setApprovalOpen(open);
        }}
      >
        <DialogContent showCloseButton={!approval.isPending}>
          <DialogHeader>
            <DialogTitle>Approve ad</DialogTitle>
            <DialogDescription>
              Choose the sizes to save as finished images. Approval freezes the
              creative and copy; it does not publish the ad.
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={approval.isPending} className="space-y-3">
            <legend className="mb-3 text-sm font-medium">Export sizes</legend>
            {IDEA_SHAPES.map((size) => (
              <label key={size} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exportShapes.includes(size)}
                  onChange={(event) =>
                    setExportShapes((current) =>
                      event.target.checked
                        ? [...current, size]
                        : current.filter((value) => value !== size),
                    )
                  }
                />
                {IDEA_SHAPE_LABELS[size]}
              </label>
            ))}
          </fieldset>
          {savedState.document.intendedPlacements?.some(
            (p) => !p.endsWith("-feed"),
          ) &&
            !exportShapes.includes("story") && (
              <p className="text-sm text-muted-foreground">
                Stories or Reels are intended, but no vertical export is
                selected. Those placements will remain incomplete.
              </p>
            )}
          {approval.isPending ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4"
            >
              <Loader2
                aria-hidden="true"
                className="size-5 shrink-0 animate-spin motion-reduce:animate-none"
              />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Rendering and saving{" "}
                  {savedState.document.cards.length * exportShapes.length}{" "}
                  {savedState.document.cards.length * exportShapes.length === 1
                    ? "image"
                    : "images"}
                  …
                </p>
                <p className="text-sm text-muted-foreground">
                  This may take a moment. We’ll close this dialog when they’re
                  ready.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {savedState.document.cards.length} {isStatic ? "image" : "slides"}{" "}
              × {exportShapes.length} sizes ={" "}
              {savedState.document.cards.length * exportShapes.length} saved
              images.
            </p>
          )}
          {approvalVersion !== savedState.version && (
            <p role="alert" className="text-sm">
              This ad changed. Close this dialog and review the latest version
              before approving.
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={approval.isPending}
              onClick={() => setApprovalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                approval.isPending ||
                !exportShapes.length ||
                approvalVersion !== savedState.version
              }
              onClick={() =>
                approval.mutate({
                  adId: ad.id,
                  status: "approved",
                  expectedUpdatedAt: approvalVersion,
                  exportShapes,
                })
              }
            >
              {approval.isPending
                ? "Saving creative…"
                : "Approve & save creative"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {collapsed && (
        <AdIdeaPreview
          brandId={brandId}
          brandName={brandName}
          brandLogo={brandLogo}
          studio={{
            document: savedState.document,
            approval: ad.content.ideaStudio?.approval,
          }}
        />
      )}
      {!collapsed && (
        <>
          <div className="flex gap-1" aria-label="Ad view">
            {(["details", "platform"] as const).map((item) => (
              <Button
                key={item}
                size="sm"
                variant={view === item ? "secondary" : "ghost"}
                onClick={() => setView(item)}
              >
                {item === "platform" ? "Platform preview" : "Details"}
              </Button>
            ))}
          </div>
          {approved && view === "details" && (
            <p className="text-sm text-muted-foreground">
              Reopen the idea to edit. Approved exports remain fixed until you
              approve again.
            </p>
          )}
          {view !== "details" && (
            <AdIdeaPreview
              brandId={brandId}
              brandName={brandName}
              brandLogo={brandLogo}
              studio={{
                document: savedState.document,
                approval: ad.content.ideaStudio?.approval,
              }}
              platform={view === "platform"}
            />
          )}
          {view === "details" && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Intended placements</h4>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={approved || busy}
                  onClick={() => openEditor("placements")}
                >
                  Choose placements
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Creative goals for this ad. Delivery placements are chosen in
                Meta setup.
              </p>
              {!savedState.document.intendedPlacements?.length && (
                <p className="text-sm text-muted-foreground">
                  No placements designated yet.
                </p>
              )}
              {META_PLACEMENTS.filter((p) =>
                savedState.document.intendedPlacements?.includes(p.id),
              ).map((p) => {
                const size =
                  p.kind === "feed"
                    ? savedState.document.shapes.includes("portrait")
                      ? "portrait"
                      : savedState.document.shapes[0]!
                    : "story";
                const missing =
                  !savedState.document.cards.length ||
                  savedState.document.cards.some((c) => !ideaSource(c, size));
                const exported =
                  ad.content.ideaStudio?.approval?.renders[size]?.length ===
                    savedState.document.cards.length && !missing;
                return (
                  <p key={p.id} className="text-sm">
                    {p.label} ·{" "}
                    {missing
                      ? "Needs images"
                      : exported
                        ? "Saved creative available"
                        : approved
                          ? "Needs approved export"
                          : "Preview and approve creative"}
                    {!isStatic && p.kind !== "feed"
                      ? " · Vertical carousel delivery not supported yet"
                      : ""}
                  </p>
                );
              })}
            </div>
          )}
          {view === "details" && (
            <fieldset
              disabled={
                approved || approval.isPending || busy || editor !== null
              }
              className="space-y-5"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Ad copy</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditor("copy")}
                  >
                    Edit copy
                  </Button>
                </div>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  {(
                    [
                      ["Headline", savedState.document.copy.headline],
                      ["Primary text", savedState.document.copy.body],
                      ["Destination URL", savedState.document.copy.linkUrl],
                      ["Call to action", savedState.document.copy.callToAction],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="mb-1 text-xs text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="break-words whitespace-pre-wrap">
                        {value || "Not set"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="space-y-3 border-t pt-4">
                {savedState.document.cards.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center">
                    <h4 className="text-sm font-medium">
                      {isStatic ? "Start with an image" : "Build your carousel"}
                    </h4>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {isStatic
                        ? "Choose a photo or upload finished artwork. You can add text and adjust the composition next."
                        : "Choose the photos or finished artwork for your slides. Then arrange them and add your message."}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditor("pool")}
                    >
                      {isStatic ? "Add image" : "Add images"}
                    </Button>
                    {Boolean(savedState.document.pool?.length) && (
                      <p className="text-xs text-muted-foreground">
                        {savedState.document.pool?.length} images available in
                        this ad’s pool
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <h4 className="text-sm font-medium">
                      {isStatic
                        ? "Creative"
                        : `Slides · ${savedState.document.cards.length}`}
                    </h4>
                    <div
                      className="flex flex-wrap items-center gap-1"
                      aria-label="Creative shape"
                    >
                      {IDEA_SHAPES.map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={shape === s ? "secondary" : "ghost"}
                          aria-pressed={shape === s}
                          onClick={() => setShape(s)}
                        >
                          {IDEA_SHAPE_LABELS[s]}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Preview the layout in each shape. Choose which sizes to
                      save when approving.
                    </p>
                    {savedState.document.cards.map((slide, index) =>
                      renderSlide(slide, index, false),
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                      <p className="text-sm text-muted-foreground">
                        Image pool · {savedState.document.pool?.length ?? 0}{" "}
                        photos
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditor("pool")}
                      >
                        {isStatic
                          ? "Manage image"
                          : "Manage images / add slides"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </fieldset>
          )}
        </>
      )}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditor(null);
            setPicker(null);
            setHomePickerOpen(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editor === "placements"
                ? "Intended placements"
                : editor === "copy"
                  ? "Edit ad copy"
                  : editor === "slide"
                    ? `Edit ${isStatic ? "image" : `slide ${document.cards.findIndex((c) => c.id === selectedId) + 1}`}`
                    : "Manage images"}
            </DialogTitle>
            <DialogDescription>
              {savedState.name} · Changes apply when you save.
            </DialogDescription>
          </DialogHeader>
          {stale && (
            <p role="alert" className="text-sm">
              This idea changed elsewhere. Close and reopen this dialog to edit
              the latest version. Your changes have not been applied.
            </p>
          )}
          <fieldset disabled={busy || stale} className="space-y-4">
            {editor === "placements" &&
              META_PLACEMENTS.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      document.intendedPlacements?.includes(p.id) ?? false
                    }
                    onChange={(e) =>
                      edit((d) => ({
                        ...d,
                        intendedPlacements: e.target.checked
                          ? [...(d.intendedPlacements ?? []), p.id]
                          : d.intendedPlacements?.filter((id) => id !== p.id),
                      }))
                    }
                  />
                  {p.label}
                </label>
              ))}
            {editor === "copy" && (
              <>
                <label className="block space-y-1 text-xs">
                  Ad idea name
                  <Input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <h3 className="text-sm font-medium md:col-span-2">Ad copy</h3>
                  <p className="text-xs text-muted-foreground md:col-span-2">
                    The words around the creative, shared across its images.
                  </p>
                  <label className="block space-y-1 text-xs">
                    Headline
                    <Input
                      value={document.copy.headline}
                      maxLength={300}
                      onChange={(e) =>
                        edit((d) => ({
                          ...d,
                          copy: { ...d.copy, headline: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="block space-y-1 text-xs">
                    Primary text
                    <Textarea
                      value={document.copy.body}
                      maxLength={5000}
                      onChange={(e) =>
                        edit((d) => ({
                          ...d,
                          copy: { ...d.copy, body: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">
                    <label className="block space-y-1 text-xs">
                      Destination URL
                      <Input
                        value={document.copy.linkUrl}
                        placeholder="https://"
                        onChange={(e) =>
                          edit((d) => ({
                            ...d,
                            copy: { ...d.copy, linkUrl: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="block space-y-1 text-xs">
                      Call to action
                      <Input
                        value={document.copy.callToAction}
                        maxLength={60}
                        onChange={(e) =>
                          edit((d) => ({
                            ...d,
                            copy: { ...d.copy, callToAction: e.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              </>
            )}
            {editor === "slide" &&
              card &&
              renderSlide(
                card,
                document.cards.findIndex((c) => c.id === card.id),
                true,
              )}
            {(editor === "pool" || (editor === "slide" && showPool)) && (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">
                    Image pool · {document.pool?.length ?? 0} available ·{" "}
                    {document.cards.length} selected
                  </h3>
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {isStatic
                        ? "Choose one base image. Other candidates stay here."
                        : "Choose up to ten slides. Removing a slide keeps its image here."}
                    </p>
                    {card && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={
                            poolTarget === "slide" ? "secondary" : "ghost"
                          }
                          onClick={() => setPoolTarget("slide")}
                        >
                          {isStatic ? "Choose base image" : "Add slides"}
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            poolTarget === "size" ? "secondary" : "ghost"
                          }
                          onClick={() => setPoolTarget("size")}
                        >
                          Use for{" "}
                          {isStatic
                            ? "image"
                            : `slide ${document.cards.findIndex((c) => c.id === card.id) + 1}`}{" "}
                          · {IDEA_SHAPE_LABELS[shape]}
                        </Button>
                      </div>
                    )}
                    <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                      {(document.pool ?? []).map((source, index) => {
                        const selectedIndex = document.cards.findIndex((c) =>
                          sameIdeaSource(c.source, source),
                        );
                        const disabled =
                          busy ||
                          (poolTarget === "slide" &&
                            !isStatic &&
                            (selectedIndex >= 0 ||
                              document.cards.length >= limit));
                        return (
                          <button
                            key={source.assetId ?? source.url}
                            type="button"
                            disabled={disabled}
                            onClick={() => choosePoolImage(source)}
                            aria-label={`Use pool image ${index + 1}${selectedIndex >= 0 ? `, selected as slide ${selectedIndex + 1}` : ""}`}
                            className="overflow-hidden rounded-md border bg-muted text-xs disabled:opacity-50"
                          >
                            <Image
                              unoptimized
                              src={source.url}
                              alt={`Candidate ${index + 1}`}
                              width={120}
                              height={90}
                              className="aspect-[4/3] w-full object-cover"
                            />
                            <span className="block p-1">
                              {selectedIndex >= 0
                                ? `Selected · ${selectedIndex + 1}`
                                : `Image ${index + 1}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <Dropzone
                      compact
                      title="Add photos to the pool"
                      hint="Uploads stay available; open slide slots are filled first"
                      uploading={uploading}
                      progress={progress}
                      onFiles={async (files) =>
                        attach(await uploadFiles(files), "add")
                      }
                    />
                    {ad.homeId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setHomePickerOpen(true)}
                      >
                        Add from this home
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPicker("add")}
                    >
                      Add from library
                    </Button>
                  </div>
                </div>
              </>
            )}
          </fieldset>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={!dirty || busy || stale || !name.trim()}
              onClick={() => persist(document, name, version)}
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setDeleteOpen(true)}
        >
          Delete ad idea
        </Button>
      </div>
      <DeleteAlert
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${name}?`}
        description="Deletes this ad idea and all its size variants. Uploaded images stay in the media library. This cannot be undone."
        onConfirm={() => remove.mutate({ adId: ad.id })}
        isLoading={remove.isPending}
      />
      <Dialog open={homePickerOpen} onOpenChange={setHomePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{homeGallery.data?.name ?? "Home images"}</DialogTitle>
            <DialogDescription>
              Add candidates to this idea’s pool, then choose and arrange slides
              in the editor.
            </DialogDescription>
          </DialogHeader>
          {homeGallery.isPending ? (
            <p className="text-sm">Loading home images…</p>
          ) : homeGallery.isError ? (
            <p className="text-sm">
              Could not load images.{" "}
              <Button variant="link" onClick={() => void homeGallery.refetch()}>
                Try again
              </Button>
            </p>
          ) : !homeGallery.data?.photos.length ? (
            <p className="text-sm text-muted-foreground">
              No gallery available for this home. You can still upload or choose
              from the library.
            </p>
          ) : (
            <div className="grid max-h-96 grid-cols-3 gap-2 overflow-y-auto">
              {homeGallery.data.photos.map((source, index) => {
                const added = document.pool?.some((item) =>
                  sameIdeaSource(item, source),
                );
                return (
                  <button
                    key={source.assetId ?? source.url}
                    type="button"
                    disabled={added || busy}
                    aria-label={
                      added
                        ? `Home image ${index + 1}, already in pool`
                        : `Add home image ${index + 1} to pool`
                    }
                    className="overflow-hidden rounded-md border bg-muted text-xs disabled:opacity-50"
                    onClick={() => edit((d) => withIdeaPool(d, [source]))}
                  >
                    <Image
                      unoptimized
                      src={source.url}
                      alt={`Home image ${index + 1}`}
                      width={160}
                      height={120}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <span className="block p-1">
                      {added ? "In pool" : "Add to pool"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setHomePickerOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MediaPickerDialog
        brandId={brandId}
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        existingAssetIds={[]}
        onPick={(item) => {
          attach([item], picker ?? "add");
          setPicker(null);
        }}
      />
    </article>
  );
}
