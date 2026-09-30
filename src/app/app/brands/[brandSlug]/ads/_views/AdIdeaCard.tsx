"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ideaImagesSaved, ideaSource } from "@/lib/ad-idea-studio";
import { sendAssistantIntent } from "@/lib/assistant-events";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageSquare, MoreHorizontal } from "lucide-react";
import { cn } from "@/components/ui/lib/utils";
import {} from "@/lib/meta-placement-plan";
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
import { SlidePhotoPicker } from "./SlidePhotoPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dropzone } from "@/components/ui/dropzone";
import { toast } from "@/components/ui/toast";
import { MediaPickerDialog } from "@/app/app/content/[contentId]/MediaPickerDialog";
import { useMediaUpload } from "@/app/app/media/use-media-upload";
import { orpc } from "@/orpc/client";
import {
  IDEA_SHAPES,
  IDEA_SHAPE_LABELS,
  defaultIdeaRecipe,
  ideaDocumentFromAd,
  patchIdeaRecipe,
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
  campaignId,
  brandId,
  brandName,
  brandLogo,
  deliveryState,
  home,
}: {
  ad: StudioAd;
  campaignId: string;
  brandId: string;
  brandName: string;
  brandLogo: string | null;
  deliveryState?: string;
  home?: { name: string; url: string };
}) {
  const router = useRouter();
  const approved = Boolean(ad.content.ideaStudio?.approval);
  const imagesSaved = Boolean(
    ad.content.ideaStudio && ideaImagesSaved(ad.content.ideaStudio),
  );
  const [view, setView] = useState<"overview" | "details" | "platform">(() =>
    !approved && ideaDocumentFromAd(ad).cards.length === 0
      ? "details"
      : "overview",
  );
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
  const approval = useMutation(
    orpc.ads.setAdStatus.mutationOptions({
      onSuccess: () => {
        toast.success(
          approved
            ? "Draft reopened. Previously pushed ads are unchanged."
            : "Ad approved",
        );
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
    "copy" | "slide" | "image" | "pool" | null
  >(null);
  const [showPool, setShowPool] = useState(false);
  const [savedState, setSavedState] = useState(() => ({
    document: ideaDocumentFromAd(ad),
    name: ad.name,
    version: ad.updatedAt,
  }));
  const [shape, setShape] = useState<IdeaShape>("portrait");
  const [homePickerOpen, setHomePickerOpen] = useState(false);
  const [selectedHomeId, setSelectedHomeId] = useState(ad.homeId ?? "");
  const [photoSearch, setPhotoSearch] = useState("");
  /** The slide whose photo is being changed from its row, saved on pick. */
  const [swapping, setSwapping] = useState<string | null>(null);
  const homeGalleries = useQuery({
    ...orpc.ads.starterIdeaHomes.queryOptions({ input: { campaignId } }),
    enabled:
      editor === "image" ||
      editor === "pool" ||
      homePickerOpen ||
      swapping !== null,
  });
  const homes = homeGalleries.data ?? [];
  const galleryHome = homes.find((home) => home.id === selectedHomeId);
  const galleryPhotos = (galleryHome ? [galleryHome] : homes)
    .flatMap((home) => home.photos)
    .filter((source) =>
      source.label.toLowerCase().includes(photoSearch.toLowerCase()),
    );
  const photoLabel = (source: IdeaSource, index: number) =>
    source.label ??
    homes
      .flatMap((home) => home.photos)
      .find((photo) => sameIdeaSource(photo, source))?.label ??
    `Image ${index + 1}`;
  const [poolTarget, setPoolTarget] = useState<"slide" | "size">("slide");
  const [picker, setPicker] = useState<"add" | "replace" | "swap" | null>(null);
  const { uploadFiles, uploading, progress } = useMediaUpload(brandId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useMutation(
    orpc.ads.deleteAd.mutationOptions({
      onSuccess: () => {
        setDeleteOpen(false);
        toast.success("Ad idea deleted");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const save = useMutation(
    orpc.ads.saveIdea.mutationOptions({
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
    kind: "copy" | "slide" | "image" | "pool",
    id: string | null = null,
  ) => {
    setDocument(savedState.document);
    setName(savedState.name);
    setVersion(savedState.version);
    setDirty(false);
    setSelectedId(id);
    setPoolTarget(kind === "image" ? "size" : "slide");
    setShowPool(kind === "pool");
    setSwapping(null);
    if (kind !== "copy") setView("details");
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
  const swapCrop = useMutation(orpc.ads.suggestCrop.mutationOptions());
  const busy =
    save.isPending || remove.isPending || swapCrop.isPending || uploading > 0;
  const updateCardById = (id: string, fn: (current: IdeaImage) => IdeaImage) =>
    edit((d) => ({
      ...d,
      cards: d.cards.map((c) => (c.id === id ? fn(c) : c)),
    }));
  // A newly chosen photo gets the AI's crop for the size it was chosen at.
  const crop = useMutation(orpc.ads.suggestCrop.mutationOptions());
  const pickCrop = (cardId: string, size: IdeaShape, url: string) =>
    crop.mutate(
      { url, formatId: size },
      {
        onSuccess: (imagePosition) =>
          updateCardById(cardId, (c) =>
            patchIdeaRecipe(c, size, { imagePosition }),
          ),
      },
    );
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
    const picked = (mode === "replace" ? images.slice(0, 1) : images).map(
      (item) => ({ item, id: crypto.randomUUID() }),
    );
    edit((current) => {
      const d = withIdeaPool(
        current,
        images.map((item) => ({ url: item.url, assetId: item.assetId })),
      );
      const next = [...d.cards];
      const selected = next.findIndex((c) => c.id === targetId);
      for (const [index, { item, id }] of picked.entries()) {
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
            id,
            source,
            mode: "supplied",
            recipe: defaultIdeaRecipe(d.role),
            overrides: {},
          });
      }
      return { ...d, cards: next };
    });
    if (mode === "replace" && targetId)
      pickCrop(targetId, targetShape, picked[0]!.item.url);
    else if (mode === "add")
      for (const { item, id } of picked) pickCrop(id, shape, item.url);
  };
  const choosePoolImage = (source: IdeaSource) => {
    if (poolTarget === "size" && card) {
      updateCardById(card.id, (c) => ({
        ...c,
        sourceOverrides: { ...c.sourceOverrides, [shape]: source },
      }));
      pickCrop(card.id, shape, source.url);
    } else if (isStatic && card) {
      updateCardById(card.id, (c) => ({ ...c, source }));
      pickCrop(card.id, shape, source.url);
    } else {
      attach([{ ...source, type: "image" }], "add");
    }
  };
  // The catalog's switcher: the photo changes in every size and saves, with
  // the AI's crop for the size on screen. Per-size images stay in Edit slide.
  const swapPhoto = async (cardId: string, source: IdeaSource) => {
    const imagePosition = await swapCrop
      .mutateAsync({ url: source.url, formatId: shape })
      .catch(() => null);
    const d = savedState.document;
    persist(
      withIdeaPool(
        {
          ...d,
          cards: d.cards.map((c) => {
            if (c.id !== cardId) return c;
            const { [shape]: _shown, ...sourceOverrides } =
              c.sourceOverrides ?? {};
            const next = { ...c, source, sourceOverrides };
            return imagePosition
              ? patchIdeaRecipe(next, shape, { imagePosition })
              : next;
          }),
        },
        [source],
      ),
    );
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
          ? ad.content.ideaStudio?.approval?.renders[shape]?.[index]?.url
          : undefined
      }
      onEdit={() => openEditor("slide", slide.id)}
      onChange={(fn) => updateCardById(slide.id, fn)}
      onReplace={() => (editing ? setPicker("replace") : setSwapping(slide.id))}
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
      photoPanel={
        !editing && swapping === slide.id ? (
          <SlidePhotoPicker
            homes={homes}
            loading={homeGalleries.isLoading}
            initialHomeId={ad.homeId ?? null}
            current={ideaSource(slide, shape)}
            disabled={busy}
            onPick={(source) => void swapPhoto(slide.id, source)}
            onLibrary={() => setPicker("swap")}
            onDone={() => setSwapping(null)}
          />
        ) : undefined
      }
    />
  );

  const closeEditor = () => {
    setEditor(null);
    setPicker(null);
    setHomePickerOpen(false);
  };
  // The editor opens in place of what it edits, like a catalog row.
  const editorPanel = (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <h4 className="text-sm font-medium">
        {editor === "copy"
          ? "Edit ad copy"
          : editor === "slide"
            ? `Edit ${isStatic ? "image" : `slide ${document.cards.findIndex((c) => c.id === selectedId) + 1}`}`
            : editor === "image"
              ? `Choose image · ${isStatic ? "Image" : `Slide ${document.cards.findIndex((c) => c.id === selectedId) + 1}`} · ${IDEA_SHAPE_LABELS[shape]}`
              : "Manage images"}
      </h4>
      {stale && (
        <p role="alert" className="text-sm">
          This idea changed elsewhere. Cancel and reopen to edit the latest
          version. Your changes have not been applied.
        </p>
      )}
      <fieldset disabled={busy || stale} className="space-y-4">
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
                Description
                <Input
                  value={document.copy.description ?? ""}
                  maxLength={120}
                  placeholder="Blank lets Meta use the landing page's"
                  onChange={(e) =>
                    edit((d) => ({
                      ...d,
                      copy: { ...d.copy, description: e.target.value },
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
        {(editor === "image" ||
          editor === "pool" ||
          (editor === "slide" && showPool)) && (
          <>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">
                  Image pool · {document.pool?.length ?? 0} available
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setHomePickerOpen(true)}
                >
                  Choose from house
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  {editor === "image"
                    ? `Choose an image for ${IDEA_SHAPE_LABELS[shape]}. Your composition stays in place.`
                    : isStatic
                      ? "Choose one base image. Other candidates stay here."
                      : "Choose up to ten slides. Removing a slide keeps its image here."}
                </p>
                {card && editor !== "image" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={poolTarget === "slide" ? "secondary" : "ghost"}
                      onClick={() => setPoolTarget("slide")}
                    >
                      {isStatic ? "Choose base image" : "Add slides"}
                    </Button>
                    <Button
                      size="sm"
                      variant={poolTarget === "size" ? "secondary" : "ghost"}
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
                <div className="grid max-h-64 auto-rows-max grid-cols-3 content-start items-start gap-2 overflow-y-auto sm:grid-cols-4">
                  {(document.pool ?? []).map((source, index) => {
                    const selectedIndex = document.cards.findIndex((c) =>
                      sameIdeaSource(c.source, source),
                    );
                    const currentSource = card ? ideaSource(card, shape) : null;
                    const selectedForSize =
                      editor === "image" &&
                      currentSource !== null &&
                      sameIdeaSource(currentSource, source);
                    const disabled =
                      busy ||
                      (poolTarget === "slide" &&
                        !isStatic &&
                        (selectedIndex >= 0 || document.cards.length >= limit));
                    return (
                      <button
                        key={source.assetId ?? source.url}
                        type="button"
                        disabled={disabled}
                        onClick={() => choosePoolImage(source)}
                        aria-pressed={
                          editor === "image" ? selectedForSize : undefined
                        }
                        aria-label={`Use pool image ${index + 1}${selectedIndex >= 0 ? `, selected as slide ${selectedIndex + 1}` : ""}`}
                        className="overflow-hidden rounded-md border bg-muted text-xs disabled:opacity-50 aria-pressed:ring-2 aria-pressed:ring-primary"
                      >
                        <Image
                          unoptimized
                          src={source.url}
                          alt={photoLabel(source, index)}
                          width={120}
                          height={90}
                          className="aspect-[4/3] w-full object-cover"
                        />
                        <span className="block p-1">
                          <span
                            className="block truncate"
                            title={photoLabel(source, index)}
                          >
                            {photoLabel(source, index)}
                          </span>
                          {editor === "image"
                            ? selectedForSize
                              ? "Selected image"
                              : ""
                            : selectedIndex >= 0
                              ? `Selected · ${selectedIndex + 1}`
                              : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Dropzone
                  compact
                  title={
                    editor === "image"
                      ? "Upload a replacement image"
                      : "Add photos to the pool"
                  }
                  hint={
                    editor === "image"
                      ? "The first image replaces this size; others stay in the pool"
                      : "Uploads stay available; open slide slots are filled first"
                  }
                  uploading={uploading}
                  progress={progress}
                  onFiles={async (files) =>
                    attach(
                      await uploadFiles(files),
                      editor === "image" ? "replace" : "add",
                    )
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPicker(editor === "image" ? "replace" : "add")
                  }
                >
                  {editor === "image"
                    ? "Choose from library"
                    : "Add from library"}
                </Button>
              </div>
            </div>
          </>
        )}
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={closeEditor}>
          Cancel
        </Button>
        <Button
          disabled={!dirty || busy || stale || !name.trim()}
          onClick={() => persist(document, name, version)}
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
  return (
    <article
      id={`ad-${ad.id}`}
      className="space-y-5 rounded-xl border bg-card p-5"
      aria-label={ad.name}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="font-medium break-words">{savedState.name}</h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>
              {isStatic ? "Static" : "Carousel"} ·{" "}
              {savedState.document.cards.length} {isStatic ? "image" : "slides"}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {approved
                ? imagesSaved
                  ? "Approved · images saved"
                  : "Approved"
                : ad.content.metaImport
                  ? "Needs local review"
                  : "Draft idea"}
              {deliveryState ? ` · ${deliveryState}` : ""}
            </span>
            {save.isPending && <span>· Saving…</span>}
            {crop.isPending && <span>· Choosing crop…</span>}
            {ad.content.metaImport && <span aria-hidden="true">·</span>}
            {ad.content.metaImport && (
              <Dialog>
                <span className="inline-flex items-center gap-2">
                  <span>Imported from Meta</span>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="underline underline-offset-4 hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {ad.content.metaImport.issues.length
                        ? "Review import"
                        : "Source details"}
                    </button>
                  </DialogTrigger>
                </span>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Imported creative</DialogTitle>
                    <DialogDescription>
                      Review the recovered artwork and copy before reusing this
                      ad. Source data is kept for reference.
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
                        {JSON.stringify(
                          ad.content.metaImport.rawCreative,
                          null,
                          2,
                        )}
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
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || editor !== null}
            onClick={() =>
              sendAssistantIntent({
                type: "work_ad_campaign",
                newThread: true,
                brandId,
                brandName,
                campaignId,
                campaignName: "this ad's campaign",
                adId: ad.id,
                focus: "ads",
                visibleText: `Work on “${savedState.name}”. Inspect its existing carousel photos, use the brand and house facts, write shared ad copy, and compose each slide for its intended sizes. Keep the selected images and slide order, and save the result for review.`,
              })
            }
          >
            <MessageSquare className="size-3.5" /> Start new chat
          </Button>
          <Button
            size="sm"
            variant={approved ? "outline" : "default"}
            disabled={busy || approval.isPending || editor !== null}
            onClick={() =>
              approval.mutate({
                adId: ad.id,
                status: approved ? "drawn" : "approved",
                expectedUpdatedAt: savedState.version,
                ...(approved
                  ? {}
                  : {
                      exportShapes: [
                        ...(savedState.document.exportShapes ??
                          savedState.document.shapes),
                      ],
                    }),
              })
            }
          >
            {approval.isPending
              ? "Working…"
              : approved
                ? "Reopen idea"
                : "Approve"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              appearance="icon"
              aria-label={`More for ${savedState.name}`}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                variant="destructive"
                disabled={busy}
                onClick={() => setDeleteOpen(true)}
              >
                Delete ad…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {collapsed && (
        <AdIdeaPreview
          onExpand={() => setView("details")}
          brandId={brandId}
          brandName={brandName}
          brandLogo={brandLogo}
          home={home}
          studio={{
            document: savedState.document,
            approval: ad.content.ideaStudio?.approval,
          }}
        />
      )}
      {!collapsed && (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Ad copy</h4>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={approved || busy || editor !== null}
                  onClick={() => openEditor("copy")}
                >
                  Edit copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded
                  onClick={() => setView("overview")}
                >
                  Collapse
                </Button>
              </div>
            </div>
            {editor === "copy" ? (
              editorPanel
            ) : (
              <dl className="grid grid-cols-1 gap-4 text-sm @xl:grid-cols-2">
                {(
                  [
                    ["Headline", savedState.document.copy.headline],
                    ["Description", savedState.document.copy.description],
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
            )}
          </div>
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
              content={ad.content}
              home={home}
              platform={view === "platform"}
            />
          )}
          {view === "details" && (
            <div className="space-y-5">
              <div className="space-y-3 border-t pt-4">
                <div className="space-y-2">
                  <h5 className="text-xs font-medium">Creative sizes</h5>
                  <div
                    className="flex flex-wrap gap-2"
                    aria-label="Creative sizes"
                  >
                    {IDEA_SHAPES.map((size) => (
                      <div
                        key={size}
                        className={`flex items-center rounded-lg border transition-colors ${shape === size ? "border-ring bg-accent text-accent-foreground" : "bg-background text-muted-foreground"}`}
                      >
                        <label className="flex cursor-pointer items-center py-3 pr-1 pl-3">
                          <input
                            type="checkbox"
                            className="size-4 accent-current"
                            aria-label={`Export ${IDEA_SHAPE_LABELS[size]}`}
                            disabled={
                              approved ||
                              approval.isPending ||
                              busy ||
                              editor !== null
                            }
                            checked={(
                              savedState.document.exportShapes ??
                              savedState.document.shapes
                            ).includes(size)}
                            onChange={(event) => {
                              const selected =
                                savedState.document.exportShapes ??
                                savedState.document.shapes;
                              persist({
                                ...savedState.document,
                                exportShapes: IDEA_SHAPES.filter((item) =>
                                  item === size
                                    ? event.target.checked
                                    : selected.includes(item),
                                ),
                              });
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="rounded-md px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
                          aria-pressed={shape === size}
                          onClick={() => setShape(size)}
                        >
                          {IDEA_SHAPE_LABELS[size]}
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select a size to edit. Check sizes to export.
                  </p>
                </div>
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
                      disabled={approved || busy || editor !== null}
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
                    <div className="space-y-3">
                      {savedState.document.cards.map((slide, index) =>
                        editor === "slide" && slide.id === selectedId ? (
                          <div key={slide.id}>{editorPanel}</div>
                        ) : (
                          <fieldset
                            key={slide.id}
                            disabled={
                              approved ||
                              approval.isPending ||
                              busy ||
                              editor !== null
                            }
                          >
                            {renderSlide(slide, index, false)}
                          </fieldset>
                        ),
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                      <p className="text-sm text-muted-foreground">
                        Image pool · {savedState.document.pool?.length ?? 0}{" "}
                        photos
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={approved || busy || editor !== null}
                        onClick={() => openEditor("pool")}
                      >
                        {isStatic
                          ? "Manage image"
                          : "Manage images / add slides"}
                      </Button>
                    </div>
                  </>
                )}
                {(editor === "image" || editor === "pool") && editorPanel}
              </div>
            </div>
          )}
        </>
      )}
      <DeleteAlert
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${name}?`}
        description="Deletes this ad and all its size variants. Uploaded images stay in the media library. This cannot be undone."
        onConfirm={() => remove.mutate({ adId: ad.id })}
        isLoading={remove.isPending}
      />
      <Dialog open={homePickerOpen} onOpenChange={setHomePickerOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Choose from house</DialogTitle>
            <DialogDescription>
              {poolTarget === "size"
                ? "Choose a photo for the current slide and size."
                : "Add photos to your image pool."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Select
              value={selectedHomeId || "all"}
              onValueChange={(value) =>
                setSelectedHomeId(value === "all" ? "" : value)
              }
            >
              <SelectTrigger
                aria-label="House"
                className="h-auto! min-h-16 w-full max-w-full sm:w-96"
              >
                <SelectValue>
                  <span className="flex min-w-0 items-center gap-3 text-left">
                    {galleryHome?.photos[0] && (
                      <Image
                        unoptimized
                        src={galleryHome.photos[0].url}
                        alt=""
                        width={48}
                        height={48}
                        className="size-12 shrink-0 rounded-md object-cover"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {galleryHome?.name ?? "All houses"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {galleryHome
                          ? `${galleryHome.photos.length} photos`
                          : `${homes.length} houses`}
                      </span>
                    </span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-96">
                <SelectItem value="all">
                  All houses · {homes.length} homes
                </SelectItem>
                {homes.map((home) => (
                  <SelectItem
                    key={home.id}
                    value={home.id}
                    textValue={home.name}
                  >
                    <span className="flex items-center gap-3">
                      {home.photos[0] && (
                        <Image
                          unoptimized
                          src={home.photos[0].url}
                          alt=""
                          width={64}
                          height={64}
                          className="size-16 shrink-0 rounded-md object-cover"
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {home.name}
                        </span>
                        <span className="mt-1 flex items-center gap-1">
                          {home.photos.slice(1, 4).map((photo) => (
                            <Image
                              key={photo.url}
                              unoptimized
                              src={photo.url}
                              alt=""
                              width={32}
                              height={24}
                              className="h-6 w-8 rounded object-cover"
                            />
                          ))}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {home.photos.length} photos
                          </span>
                        </span>
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="Search house photos"
              placeholder="Search house photos…"
              value={photoSearch}
              onChange={(event) => setPhotoSearch(event.target.value)}
            />
          </div>
          {homeGalleries.isPending ? (
            <p className="text-sm">Loading home images…</p>
          ) : homeGalleries.isError ? (
            <p className="text-sm">
              Could not load images.{" "}
              <Button
                variant="link"
                onClick={() => void homeGalleries.refetch()}
              >
                Try again
              </Button>
            </p>
          ) : !galleryPhotos.length ? (
            <p className="text-sm text-muted-foreground">
              No gallery available for this home. You can still upload or choose
              from the library.
            </p>
          ) : (
            <div className="grid max-h-[50vh] auto-rows-max grid-cols-2 content-start items-start gap-3 overflow-y-auto sm:grid-cols-3">
              {galleryPhotos.map((source) => {
                const added = document.pool?.some((item) =>
                  sameIdeaSource(item, source),
                );
                return (
                  <button
                    key={source.assetId ?? source.url}
                    type="button"
                    disabled={(poolTarget !== "size" && added) || busy}
                    aria-label={`${poolTarget === "size" ? "Use" : "Add"} ${source.label}`}
                    className="overflow-hidden rounded-md border bg-muted text-xs disabled:opacity-50 aria-pressed:ring-2 aria-pressed:ring-primary"
                    onClick={() => {
                      edit((d) => withIdeaPool(d, [source]));
                      if (poolTarget === "size") {
                        choosePoolImage(source);
                        setHomePickerOpen(false);
                      }
                    }}
                  >
                    <Image
                      unoptimized
                      src={source.url}
                      alt={source.label}
                      width={160}
                      height={120}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <span className="block p-1">
                      {source.label}
                      {poolTarget !== "size" && added ? " · In pool" : ""}
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
          if (picker === "swap") {
            if (item.type !== "image")
              toast.error("Choose a still image for this ad idea");
            else if (swapping)
              void swapPhoto(swapping, {
                url: item.url,
                ...(item.assetId ? { assetId: item.assetId } : {}),
              });
            setPicker(null);
            return;
          }
          attach([item], picker ?? "add");
          setPicker(null);
        }}
      />
    </article>
  );
}
