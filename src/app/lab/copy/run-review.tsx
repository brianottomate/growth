"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import {
  starterCompositionTemplate,
  starterCompositionCta,
} from "@/lib/starter-ad-generation";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AdMock } from "@/components/ad-mock";
import { AdCopyFields } from "./ad-copy-fields";
import { labCompositionUrl } from "./home-suite";
import {
  ideaDocumentSchema,
  ideaPreviewUrl,
  ideaRecipe,
  IDEA_SHAPES,
  type IdeaDocument,
  type IdeaImage,
  type IdeaRecipe,
  type IdeaShape,
} from "@/lib/ad-idea-studio";
import { type CompositionTemplateId } from "@/lib/compositions";
import { COPY_LAB_COMPOSITION_TEMPLATES } from "@/lib/copy-lab";
import type {
  CopyLabBrand,
  CopyLabHome,
  CopyLabHomeSuite,
  CopyLabRunResult,
  CopyLabVariant,
} from "@/lib/copy-lab";

const placements: { shape: IdeaShape; ratio: string; label: string }[] = [
  { shape: "square", ratio: "1:1", label: "Square feed" },
  { shape: "portrait", ratio: "4:5", label: "Portrait feed" },
  { shape: "story", ratio: "9:16", label: "Story" },
  { shape: "wide", ratio: "16:9", label: "Landscape feed" },
];
const templates = COPY_LAB_COMPOSITION_TEMPLATES;
type Documents = { static: IdeaDocument | null; carousel: IdeaDocument | null };
type Kind = keyof Documents;

function PreviewTile({
  document,
  slide,
  index,
  shape,
  home,
  homes,
  brand,
  onRecipe,
  onCard,
}: {
  document: IdeaDocument;
  slide: IdeaImage;
  index: number;
  shape: IdeaShape;
  home: CopyLabHome;
  homes?: CopyLabHome[];
  brand: CopyLabBrand;
  onRecipe: (patch: Partial<IdeaRecipe>) => void;
  onCard?: (index: number) => void;
}) {
  const fieldId = useId();
  const recipe = ideaRecipe(slide, shape);
  const supplied = slide.mode === "supplied" && !slide.overrides[shape];
  const copy = document.copyOverrides[shape] ?? document.copy;
  const headline = slide.copy?.headline ?? copy.headline;
  const description = slide.copy?.description ?? copy.description ?? "";
  return (
    <section
      className="w-60 shrink-0 space-y-2"
      aria-label={`Slide ${index + 1} · ${shape}`}
    >
      <p className="text-xs font-medium">
        {placements.find((p) => p.shape === shape)!.label} ·{" "}
        {placements.find((p) => p.shape === shape)!.ratio}
      </p>
      <AdMock
        className="w-full"
        surface={shape === "story" ? "story" : "instagram"}
        publisher="instagram"
        crop={shape}
        brandName={brand.name}
        brandLogo={null}
        body={copy.body}
        headline={headline}
        description={description || null}
        link={copy.linkUrl || null}
        callToAction={copy.callToAction}
        card={onCard ? index : 0}
        onCard={onCard}
        media={(onCard ? document.cards : [slide]).flatMap((item) => {
          const sourceHome =
            homes?.find((h) => h.id === item.source.homeId) ?? home;
          const raw = item.mode === "supplied" && !item.overrides[shape];
          const url = raw
            ? item.source.url
            : ideaPreviewUrl(home.brandId, { ...item, mode: "compose" }, shape);
          return url
            ? [
                {
                  url: raw ? url : labCompositionUrl(url, sourceHome),
                  type: "image",
                  headline: item.copy?.headline ?? copy.headline,
                  description: item.copy?.description ?? copy.description ?? "",
                },
              ]
            : [];
        })}
      />
      <Dialog>
        <DialogTrigger asChild>
          <Button size="xs" variant="outline">
            Adjust composition
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Composition · slide {index + 1} ·{" "}
              {placements.find((p) => p.shape === shape)!.ratio}
            </DialogTitle>
            <DialogDescription>
              These adjustments affect only this image and placement in this
              run.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1 text-sm">
            <span>Layout</span>
            <SimpleSelect
              aria-label="Composition layout"
              value={supplied ? "photo-only" : recipe.templateId}
              options={templates.map((t) => ({ value: t.id, label: t.label }))}
              onValueChange={(v) =>
                onRecipe({ templateId: v as CompositionTemplateId })
              }
            />
          </label>
          {(["title", "subtitle", "eyebrow", "cta"] as const).map((field) => (
            <div key={field} className="space-y-1">
              <label
                htmlFor={`${fieldId}-${field}`}
                className="text-sm capitalize"
              >
                {field === "cta" ? "Image CTA" : field}
              </label>
              <Textarea
                id={`${fieldId}-${field}`}
                rows={2}
                value={recipe[field]}
                onChange={(e) => onRecipe({ [field]: e.target.value })}
              />
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SlideCopy({
  slide,
  index,
  document,
  onChange,
}: {
  slide: IdeaImage;
  index: number;
  document: IdeaDocument;
  onChange: (patch: NonNullable<IdeaImage["copy"]>) => void;
}) {
  const fieldId = useId();
  const headline = slide.copy?.headline ?? document.copy.headline;
  const description =
    slide.copy?.description ?? document.copy.description ?? "";
  return (
    <section className="rounded-lg border p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        {/* oxlint-disable-next-line nextjs/no-img-element */}
        <img
          src={slide.source.url}
          alt=""
          className="h-9 w-12 rounded object-cover"
          loading="lazy"
        />
        <div>
          <h5 className="text-xs font-semibold">Slide {index + 1}</h5>
          {slide.source.label && (
            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer">
                Photo choice · role and reason
              </summary>
              <p className="mt-1">{slide.source.label}</p>
            </details>
          )}
          {!slide.copy && (
            <p className="text-[10px] text-muted-foreground">
              Uses shared ad copy
            </p>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-[10px] text-muted-foreground uppercase">
            Headline
          </dt>
          <dd className="whitespace-pre-wrap">{headline || "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground uppercase">
            Description
          </dt>
          <dd className="whitespace-pre-wrap">{description || "—"}</dd>
        </div>
      </dl>
      <Dialog>
        <DialogTrigger asChild>
          <Button className="mt-2" size="xs" variant="ghost">
            Edit slide copy
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ad copy · slide {index + 1}</DialogTitle>
            <DialogDescription>
              The primary text is shared across the carousel. These fields
              belong to this slide.
            </DialogDescription>
          </DialogHeader>
          {(["headline", "description"] as const).map((field) => (
            <div key={field} className="space-y-1">
              <label
                htmlFor={`${fieldId}-${field}`}
                className="text-sm capitalize"
              >
                {field}
              </label>
              <Textarea
                id={`${fieldId}-${field}`}
                rows={2}
                value={field === "headline" ? headline : description}
                onChange={(e) =>
                  onChange({ ...slide.copy, [field]: e.target.value })
                }
              />
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Generated snapshots stay immutable; all review adjustments belong to this run. */
export function RunReview({
  id,
  title,
  at,
  output,
  result,
  variant,
  home,
  homes,
  brand,
  selected,
  onUse,
  onDelete,
  navigation,
}: {
  id: string;
  title: string;
  at?: string;
  output: CopyLabHomeSuite;
  result?: CopyLabRunResult;
  variant?: CopyLabVariant;
  home: CopyLabHome;
  homes?: CopyLabHome[];
  brand: CopyLabBrand;
  selected?: boolean;
  onUse?: () => void;
  onDelete?: () => void;
  navigation?: ReactNode;
}) {
  const [collapsedCarousel, setCollapsedCarousel] = useState(false);
  const [carouselCard, setCarouselCard] = useState(0);
  const [shapes, setShapes] = useState<IdeaShape[]>(["square", "story"]);
  const [documents, setDocuments] = useState<Documents>({
    static: output.static,
    carousel: output.carousel,
  });
  const [loaded, setLoaded] = useState(false);
  const storageKey = `copy-lab:v1:review:${id}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { static: unknown; carousel: unknown };
        const staticDoc = ideaDocumentSchema.nullable().safeParse(saved.static);
        const carouselDoc = ideaDocumentSchema
          .nullable()
          .safeParse(saved.carousel);
        if (staticDoc.success && carouselDoc.success)
          setDocuments({ static: staticDoc.data, carousel: carouselDoc.data });
      }
    } catch {
      /* Keep the generated snapshot if storage is unavailable. */
    }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (loaded && result)
      try {
        localStorage.setItem(storageKey, JSON.stringify(documents));
      } catch {
        /* Session adjustments still work. */
      }
  }, [documents, loaded, result, storageKey]);
  const patchRecipe = (
    kind: Kind,
    index: number,
    shape: IdeaShape,
    patch: Partial<IdeaRecipe>,
  ) =>
    setDocuments((current) => {
      const doc = current[kind];
      if (!doc) return current;
      return {
        ...current,
        [kind]: {
          ...doc,
          cards: doc.cards.map((slide, i) =>
            i === index
              ? {
                  ...slide,
                  overrides: {
                    ...slide.overrides,
                    [shape]: { ...ideaRecipe(slide, shape), ...patch },
                  },
                }
              : slide,
          ),
        },
      };
    });
  const sameCopy =
    JSON.stringify(documents.static?.copy) ===
    JSON.stringify(documents.carousel?.copy);
  const copyKinds: Kind[] = sameCopy ? ["static"] : ["static", "carousel"];
  return (
    <article
      className={`@container min-w-0 overflow-hidden rounded-xl border bg-background ${selected ? "ring-2 ring-primary" : ""}`}
      aria-label={title}
    >
      <header className="flex flex-col gap-3 border-b bg-muted/30 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {at
                ? new Date(at).toLocaleString()
                : "Fixture photos · no generation yet"}
              {result &&
                ` · ${result.model} · ${(result.ms / 1000).toFixed(1)}s`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {result && (
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  setDocuments(
                    (current) =>
                      Object.fromEntries(
                        Object.entries(current).map(([kind, doc]) => [
                          kind,
                          doc
                            ? {
                                ...doc,
                                cards: doc.cards.map((card, index) => ({
                                  ...card,
                                  mode: "compose" as const,
                                  overrides: Object.fromEntries(
                                    IDEA_SHAPES.map((shape) => [
                                      shape,
                                      {
                                        ...ideaRecipe(card, shape),
                                        templateId: starterCompositionTemplate(
                                          index === 0 ||
                                            index === doc.cards.length - 1,
                                          shape === "story",
                                        ),
                                        showLogo: true,
                                        subtitle: "",
                                        eyebrow: "",
                                        cta: starterCompositionCta(
                                          index === 0 ||
                                            index === doc.cards.length - 1,
                                        ),
                                      },
                                    ]),
                                  ),
                                })),
                              }
                            : null,
                        ]),
                      ) as Documents,
                  )
                }
              >
                Apply production starter layouts
              </Button>
            )}
            {onUse && (
              <Button
                size="xs"
                variant={selected ? "secondary" : "outline"}
                onClick={onUse}
              >
                {selected ? "Starting point selected" : "Use as starting point"}
              </Button>
            )}
            {onDelete && (
              <Button
                size="xs"
                variant="outline"
                onClick={onDelete}
                aria-label={`Delete ${title}`}
              >
                Delete run
              </Button>
            )}
          </div>
        </div>
        {navigation}
      </header>
      <div className="grid min-w-0 grid-cols-1 gap-6 p-4 @4xl:grid-cols-[280px_minmax(0,1fr)] @6xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {result?.photoPlan && (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-xs font-semibold">
                AI photo plan · {result.photoPlan.candidates} photos reviewed
              </summary>
              <div className="mt-3 space-y-3">
                {[
                  { label: "Hero", ...result.photoPlan.hero },
                  ...result.photoPlan.carousel.map((choice, i) => ({
                    label: `Slide ${i + 1}`,
                    ...choice,
                  })),
                ].map((choice) => (
                  <div key={choice.label} className="flex gap-2 text-xs">
                    {/* oxlint-disable-next-line nextjs/no-img-element */}
                    <img
                      src={choice.url}
                      alt=""
                      className="h-12 w-16 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                    <div>
                      <p className="font-medium">
                        {choice.label} · {choice.occasion}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {choice.reason}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
          {copyKinds.map((kind) => {
            const doc = documents[kind];
            return (
              doc && (
                <section key={kind} className="space-y-3">
                  <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {sameCopy
                      ? "Ad copy · shared across creatives"
                      : kind === "static"
                        ? "Single-image ad copy"
                        : "Carousel ad copy"}
                  </h4>
                  <AdCopyFields
                    value={{
                      primaryText: doc.copy.body,
                      headline: doc.copy.headline,
                      description: doc.copy.description ?? "",
                    }}
                    onChange={(v) =>
                      setDocuments((current) => {
                        const next = { ...current };
                        for (const k of sameCopy
                          ? (["static", "carousel"] as const)
                          : [kind]) {
                          const d = current[k];
                          if (d)
                            next[k] = {
                              ...d,
                              copy: {
                                ...d.copy,
                                body: v.primaryText,
                                headline: v.headline,
                                description: v.description,
                              },
                            };
                        }
                        return next;
                      })
                    }
                  />
                  {Object.entries(doc.copyOverrides).map(([shape, copy]) => (
                    <details key={shape} className="rounded border p-2 text-xs">
                      <summary className="cursor-pointer">
                        {shape} ad copy override
                      </summary>
                      <AdCopyFields
                        value={{
                          primaryText: copy.body,
                          headline: copy.headline,
                          description: copy.description ?? "",
                        }}
                      />
                    </details>
                  ))}
                </section>
              )
            );
          })}
          {documents.carousel &&
            Boolean(
              documents.carousel.copy.headline ||
              documents.carousel.copy.description ||
              documents.carousel.cards.some(
                (s) => s.copy?.headline || s.copy?.description,
              ),
            ) && (
              <section className="space-y-2 border-t pt-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                  Carousel · ad copy per slide
                </h4>
                <p className="text-xs text-muted-foreground">
                  Primary text above is shared. Headline and description are
                  shown for every slide.
                </p>
                {documents.carousel.cards.map((slide, index) => (
                  <SlideCopy
                    key={slide.id}
                    slide={slide}
                    index={index}
                    document={documents.carousel!}
                    onChange={(patch) =>
                      setDocuments((current) => ({
                        ...current,
                        carousel: current.carousel
                          ? {
                              ...current.carousel,
                              cards: current.carousel.cards.map((s, i) =>
                                i === index
                                  ? { ...s, copy: { ...s.copy, ...patch } }
                                  : s,
                              ),
                            }
                          : null,
                      }))
                    }
                  />
                ))}
              </section>
            )}
          {result && (
            <details className="rounded-lg border p-3 text-xs">
              <summary className="cursor-pointer font-medium">
                Prompt snapshot · this run
              </summary>
              <p className="my-3 whitespace-pre-wrap">
                {variant?.appendix || "No appended direction."}
              </p>
              {result.promptTrace?.map((trace, i) => (
                <details key={i} className="mb-2 rounded border p-2">
                  <summary className="cursor-pointer">{trace.label}</summary>
                  <pre className="mt-2 max-h-64 overflow-auto break-words whitespace-pre-wrap">
                    {trace.system}
                    {trace.appendix &&
                      `\n\nAPPENDED DIRECTION\n${trace.appendix}`}
                    {trace.content
                      .map((p) => `\n\nUSER ${p.kind.toUpperCase()}\n${p.text}`)
                      .join("")}
                  </pre>
                </details>
              ))}
            </details>
          )}
          {Boolean(result?.problems.length) && (
            <details className="rounded-lg border p-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                Generation feedback · {result!.problems.length} retries or
                issues
              </summary>
              <p className="mt-2">{result!.problems.join(" · ")}</p>
            </details>
          )}
        </div>
        <div className="grid min-w-0 grid-cols-[52px_minmax(0,1fr)] gap-3 @3xl:grid-cols-[68px_minmax(0,1fr)]">
          <nav aria-label={`Placements · ${title}`} className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase">Show</p>
            {placements.map((p) => (
              <Button
                key={p.shape}
                className="w-full"
                size="sm"
                variant={shapes.includes(p.shape) ? "default" : "outline"}
                aria-label={`Show ${p.label} · ${title}`}
                aria-pressed={shapes.includes(p.shape)}
                onClick={() =>
                  setShapes((current) =>
                    current.includes(p.shape)
                      ? current.length > 1
                        ? current.filter((s) => s !== p.shape)
                        : current
                      : [...current, p.shape],
                  )
                }
              >
                {p.ratio}
              </Button>
            ))}
          </nav>
          <div className="@container min-w-0 space-y-6">
            <div
              className={
                documents.static
                  ? "grid min-w-0 grid-cols-1 gap-6 @3xl:grid-cols-[240px_minmax(0,1fr)]"
                  : "min-w-0"
              }
            >
              {(["static", "carousel"] as const).map((kind) => {
                const doc = documents[kind];
                if (!doc) return null;
                return (
                  <section
                    key={kind}
                    className="min-w-0 space-y-3"
                    aria-label={
                      kind === "static"
                        ? "Single image previews"
                        : "Carousel previews"
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold">
                          {kind === "static"
                            ? "Single image"
                            : collapsedCarousel
                              ? "Carousel · platform preview"
                              : "Carousel · every slide"}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {kind === "static"
                            ? "Compare selected placements in a vertical stack."
                            : collapsedCarousel
                              ? "Browse the slides inside each platform preview."
                              : "Scroll across all slides. Image copy is rendered on each photo."}
                        </p>
                      </div>
                      {kind === "carousel" && (
                        <label className="flex items-center gap-2 text-xs">
                          <Switch
                            aria-label={`Platform carousel · ${title}`}
                            checked={collapsedCarousel}
                            onCheckedChange={setCollapsedCarousel}
                          />
                          Platform carousel
                        </label>
                      )}
                    </div>
                    {doc &&
                    kind === "carousel" &&
                    collapsedCarousel &&
                    doc.cards.length > 0 ? (
                      <div className="space-y-3">
                        <div
                          className="flex flex-wrap gap-1"
                          aria-label="Carousel slide navigation"
                        >
                          {doc.cards.map((s, i) => (
                            <Button
                              key={s.id}
                              size="xs"
                              variant={
                                i ===
                                Math.min(carouselCard, doc.cards.length - 1)
                                  ? "secondary"
                                  : "outline"
                              }
                              aria-pressed={
                                i ===
                                Math.min(carouselCard, doc.cards.length - 1)
                              }
                              onClick={() => setCarouselCard(i)}
                            >
                              Slide {i + 1}
                            </Button>
                          ))}
                        </div>
                        <div className="flex flex-col gap-4">
                          {placements
                            .filter((p) => shapes.includes(p.shape))
                            .map((p) => {
                              const active = Math.min(
                                carouselCard,
                                doc.cards.length - 1,
                              );
                              return (
                                <PreviewTile
                                  key={p.shape}
                                  document={doc}
                                  slide={doc.cards[active]!}
                                  index={active}
                                  shape={p.shape}
                                  home={home}
                                  homes={homes}
                                  brand={brand}
                                  onCard={setCarouselCard}
                                  onRecipe={(patch) =>
                                    patchRecipe(kind, active, p.shape, patch)
                                  }
                                />
                              );
                            })}
                        </div>
                      </div>
                    ) : doc ? (
                      <div className="flex gap-5 overflow-x-auto pb-3">
                        {doc.cards.map((slide, index) => (
                          <div key={slide.id} className="shrink-0 space-y-2">
                            <h5 className="text-xs font-medium">
                              {kind === "static"
                                ? "Hero image"
                                : `Slide ${index + 1}`}
                            </h5>
                            <div className="flex flex-col gap-4">
                              {placements
                                .filter((p) => shapes.includes(p.shape))
                                .map((p) => (
                                  <PreviewTile
                                    key={p.shape}
                                    document={doc}
                                    slide={slide}
                                    index={index}
                                    shape={p.shape}
                                    home={home}
                                    homes={homes}
                                    brand={brand}
                                    onRecipe={(patch) =>
                                      patchRecipe(kind, index, p.shape, patch)
                                    }
                                  />
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No creative in this run.
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Composition words are shown on the images. Adjustments stay
                local to this run.
              </p>
              {result && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setDocuments({
                      static: output.static,
                      carousel: output.carousel,
                    })
                  }
                >
                  Reset preview adjustments
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
