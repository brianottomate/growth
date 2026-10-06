"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CatalogCollectionPreview } from "@/app/app/performance/clients/[brandSlug]/catalog/CatalogPreview";
import { AdMock } from "@/components/ad-mock";
import {
  ideaPreviewUrl,
  type IdeaDocument,
  type IdeaShape,
  IDEA_SHAPE_LABELS,
} from "@/lib/ad-idea-studio";
import {
  DEFAULT_CATALOG_TEMPLATE,
  catalogCardPreviewUrl,
  CATALOG_TEMPLATES,
  type CatalogTemplateId,
} from "@/lib/catalog-studio";
import {
  CATALOG_COPY_INTENTS,
  COMPOSITION_TEMPLATES,
  getCompositionFields,
  type CompositionTemplateId,
} from "@/lib/compositions";
import { META_PLACEMENTS, type MetaPlacement } from "@/lib/meta-placement-plan";
import type {
  CopyLabBrand,
  CopyLabHome,
  CopyLabHomeSuite,
} from "@/lib/copy-lab";

export function labCompositionUrl(url: string, home: CopyLabHome) {
  const params = new URLSearchParams(url.split("?")[1]);
  params.set("brandId", home.brandId);
  params.set("homeId", home.id);
  return `/api/lab/copy/preview?${params}`;
}

export function catalogArtworkUrl({
  home,
  headline,
  pills,
  photo,
  templateId,
}: {
  home: CopyLabHome;
  headline: string;
  pills: string[];
  photo?: string | null;
  templateId?: CatalogTemplateId;
}) {
  const chosen =
    templateId ??
    (CATALOG_TEMPLATES.includes(home.catalog.templateId as CatalogTemplateId)
      ? (home.catalog.templateId as CatalogTemplateId)
      : DEFAULT_CATALOG_TEMPLATE);
  const url = catalogCardPreviewUrl(home.brandId, {
    homeId: home.id,
    mode: "compose",
    included: true,
    imageUrl: photo ?? home.heroUrl ?? home.photos[0]?.url ?? "",
    templateId: chosen,
    title: headline,
    subtitle: [
      home.bedrooms && `${home.bedrooms} bedrooms`,
      home.guests && `Sleeps ${home.guests}`,
    ]
      .filter(Boolean)
      .join(" · "),
    imagePosition: "center",
    showLogo: true,
    pills,
    location: home.market?.label ?? home.place,
  });
  return labCompositionUrl(url ?? "", home);
}

export function CatalogArtwork(props: Parameters<typeof catalogArtworkUrl>[0]) {
  return (
    <Artwork src={catalogArtworkUrl(props)} label="Catalog artwork · 1:1" />
  );
}

function Artwork({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return failed === src ? (
    <p role="alert" className="rounded border border-destructive p-4 text-sm">
      Composition unavailable. Check the fixture photo and brand setup.
    </p>
  ) : (
    // oxlint-disable-next-line nextjs/no-img-element
    <img
      src={src}
      alt={label}
      onError={() => setFailed(src)}
      className="w-full max-w-80 rounded object-contain"
    />
  );
}

function ComposedAd({
  document,
  home,
  brand,
  placement,
  label,
  shape: shapeOverride,
}: {
  document: IdeaDocument;
  home: CopyLabHome;
  brand: CopyLabBrand;
  placement: MetaPlacement;
  label: string;
  shape?: IdeaShape;
}) {
  const [card, setCard] = useState(0);
  const spec = META_PLACEMENTS.find((p) => p.id === placement)!;
  const shape: IdeaShape =
    shapeOverride ??
    (spec.kind !== "feed"
      ? "story"
      : placement === "instagram-feed"
        ? "portrait"
        : "square");
  const copy = document.copyOverrides[shape] ?? document.copy;
  const media = document.cards.flatMap((slide) => {
    const url = ideaPreviewUrl(home.brandId, slide, shape);
    return url
      ? [
          {
            url: labCompositionUrl(url, home),
            type: "image",
            headline: slide.copy?.headline ?? copy.headline,
            description: slide.copy?.description ?? copy.description,
          },
        ]
      : [];
  });
  const active = Math.min(card, Math.max(0, media.length - 1));
  const [view, setView] = useState<"placement" | "artwork">("placement");
  return (
    <section className="w-80 max-w-full min-w-0 space-y-3">
      <h3 className="font-semibold">{label}</h3>
      <div className="flex gap-1">
        <Button
          size="xs"
          variant={view === "placement" ? "secondary" : "ghost"}
          onClick={() => setView("placement")}
        >
          Platform
        </Button>
        <Button
          size="xs"
          variant={view === "artwork" ? "secondary" : "ghost"}
          onClick={() => setView("artwork")}
        >
          Creative only
        </Button>
      </div>
      {view === "placement" ? (
        <AdMock
          className="w-full"
          surface={spec.surface}
          publisher={spec.publisher}
          verticalKind={spec.kind === "reel" ? "reel" : "story"}
          diagnostics={spec.kind !== "feed"}
          crop={shape}
          brandName={brand.name}
          brandLogo={null}
          body={copy.body}
          headline={copy.headline}
          description={copy.description ?? null}
          link={copy.linkUrl || null}
          callToAction={copy.callToAction ?? null}
          media={media}
          card={active}
          onCard={setCard}
          {...("frame" in spec ? { frame: spec.frame } : {})}
        />
      ) : (
        <div className="space-y-2">
          {media[active] && (
            <Artwork src={media[active].url} label={`${label} · ${shape}`} />
          )}
          <p className="text-sm whitespace-pre-wrap">{copy.body}</p>
          <p className="text-sm font-semibold">{copy.headline}</p>
          <p className="text-xs text-muted-foreground">{copy.description}</p>
        </div>
      )}
      {media.length > 1 && (
        <div className="flex flex-wrap gap-1" aria-label="Carousel slides">
          {media.map((_, index) => (
            <Button
              key={index}
              size="xs"
              variant={active === index ? "secondary" : "outline"}
              aria-pressed={active === index}
              onClick={() => setCard(index)}
            >
              Card {index + 1}
            </Button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {IDEA_SHAPE_LABELS[shape]} · {media.length}{" "}
        {media.length === 1 ? "card" : "cards"}
      </p>
    </section>
  );
}

const PREVIEW_FORMATS = [
  {
    shape: "square",
    placement: "facebook-feed",
    label: "Square · Facebook Feed",
    name: "Square",
  },
  {
    shape: "portrait",
    placement: "instagram-feed",
    label: "Portrait · Instagram Feed",
    name: "Portrait",
  },
  {
    shape: "wide",
    placement: "facebook-feed",
    label: "Landscape · Facebook Feed",
    name: "Landscape",
  },
  {
    shape: "story",
    placement: "instagram-story",
    label: "Story · Instagram Stories",
    name: "Story",
  },
] as const;

export function HomeSuite({
  output,
  home,
  brand,
  placement,
  photoUrl,
  catalogHomes,
}: {
  output: CopyLabHomeSuite;
  home: CopyLabHome;
  brand: CopyLabBrand;
  placement: MetaPlacement;
  photoUrl?: string;
  catalogHomes: CopyLabHome[];
}) {
  const [visibleShapes, setVisibleShapes] = useState<IdeaShape[]>(["square"]);
  const visibleFormats = PREVIEW_FORMATS.filter((format) =>
    visibleShapes.includes(format.shape),
  );
  const collection = catalogHomes.slice(0, 8).map((item) => {
    const generated = output.catalogHomes?.find((c) => c.homeId === item.id);
    const copy =
      generated?.copy ?? (item.id === home.id ? output.catalog : null);
    return {
      key: item.id,
      name: item.name,
      home: { nightlyFrom: item.nightlyFrom, city: item.city },
      image: catalogArtworkUrl({
        home: item,
        headline: copy?.headline ?? item.catalog.title ?? item.name,
        pills: copy?.pills ?? item.catalog.pills ?? [],
        photo: copy?.showPhoto?.url,
        templateId: generated?.templateId,
      }),
    };
  });
  const generatedCount =
    output.catalogHomes?.filter((c) => c.copy).length ??
    (output.catalog ? 1 : 0);
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Mobile preview · 320px wide. Placement previews approximate the feed.
      </p>
      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <legend className="mb-2 text-sm font-medium">Preview formats</legend>
        {PREVIEW_FORMATS.map((format) => (
          <label key={format.shape} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={visibleShapes.includes(format.shape)}
              onChange={(event) =>
                setVisibleShapes((current) =>
                  event.target.checked
                    ? [...current, format.shape]
                    : current.filter((shape) => shape !== format.shape),
                )
              }
            />
            {format.name}
          </label>
        ))}
      </fieldset>
      {visibleFormats.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Select a format to show the home ads.
        </p>
      )}
      <div className="flex min-w-0 flex-wrap items-start gap-8">
        {(["static", "carousel"] as const).map((kind) => (
          <section
            key={kind}
            className={`${visibleFormats.length > 1 ? "w-[664px]" : "w-80"} max-w-full space-y-3`}
          >
            <h3 className="font-semibold">
              {kind === "static" ? "Home static" : "Home carousel"}
            </h3>
            <div className="flex flex-wrap items-start gap-6">
              {output[kind] ? (
                visibleFormats.map((format) => (
                  <ComposedAd
                    key={`${kind}-${format.shape}`}
                    document={output[kind]!}
                    home={home}
                    brand={brand}
                    placement={format.placement}
                    shape={format.shape}
                    label={format.label}
                  />
                ))
              ) : (
                <p>Composition needs another pass.</p>
              )}
            </div>
          </section>
        ))}
        {!(
          [
            "facebook-feed",
            "instagram-feed",
            "instagram-story",
          ] as MetaPlacement[]
        ).includes(placement) && (
          <details className="w-full rounded border p-3">
            <summary className="cursor-pointer text-sm">
              Additional placement:{" "}
              {META_PLACEMENTS.find((p) => p.id === placement)?.label}
            </summary>
            <div className="mt-3 flex flex-wrap gap-6">
              {(["static", "carousel"] as const).map(
                (kind) =>
                  output[kind] && (
                    <ComposedAd
                      key={`${kind}-${placement}`}
                      document={output[kind]}
                      home={home}
                      brand={brand}
                      placement={placement}
                      label={`Home ${kind}`}
                    />
                  ),
              )}
            </div>
          </details>
        )}
      </div>
      <section className="space-y-3 border-t pt-6">
        <h3 className="font-semibold">
          Catalog · {collection.length} homes together
        </h3>
        <p className="text-xs text-muted-foreground">
          {generatedCount} generated cards ·{" "}
          {collection.length - generatedCount} source cards. Failed or
          ungenerated cards show the fixture’s existing copy.
        </p>
        <CatalogCollectionPreview
          key={`${brand.id}-${home.id}`}
          brandName={brand.name}
          cards={collection}
          compact
        />
      </section>
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Compare compositions on the same photo
        </summary>
        <div className="mt-3">
          <CompositionGallery output={output} home={home} photoUrl={photoUrl} />
        </div>
      </details>
    </div>
  );
}

function CompositionGallery({
  output,
  home,
  photoUrl,
}: {
  output: CopyLabHomeSuite;
  home: CopyLabHome;
  photoUrl?: string;
}) {
  const sourceUrl = photoUrl ?? home.heroUrl ?? home.photos[0]?.url ?? "";
  const variants = output.catalogVariants ?? [
    {
      templateId: (home.catalog.templateId ??
        DEFAULT_CATALOG_TEMPLATE) as CatalogTemplateId,
      copy: output.catalog,
      system: "",
    },
  ];
  const firstCard = output.static?.cards[0];
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Same photo · different compositions</h3>
      <p className="text-xs text-muted-foreground">
        Catalog copy is generated for each template&apos;s own guidance. Ad
        layouts use the home ad&apos;s copy. The photo stays fixed here so you
        can judge the layout.
      </p>
      <div className="flex flex-wrap items-start gap-4">
        {variants.map(({ templateId, copy, system }) => (
          <section
            key={templateId}
            className="w-80 max-w-full space-y-2 rounded-lg border p-3"
          >
            <h4 className="text-sm font-medium">
              {COMPOSITION_TEMPLATES.find((t) => t.id === templateId)?.label}
            </h4>
            {copy ? (
              <CatalogArtwork
                home={home}
                headline={copy.headline}
                pills={copy.pills}
                photo={sourceUrl}
                templateId={templateId}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Copy did not pass validation. Generate again to retry.
              </p>
            )}
            <CompositionGuide templateId={templateId} />
            {system && (
              <details className="text-xs">
                <summary className="cursor-pointer">
                  Prompt used for this composition
                </summary>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap">
                  {system}
                </pre>
              </details>
            )}
          </section>
        ))}
        {firstCard &&
          (["hero-overlay", "tall-statement"] as const).map((templateId) => {
            const story = templateId === "tall-statement";
            const recipe = story
              ? (firstCard.overrides.story ?? firstCard.recipe)
              : firstCard.recipe;
            const params = new URLSearchParams({
              brandId: home.brandId,
              homeId: home.id,
              templateId,
              formatId: story ? "story" : "square",
              sourceUrl,
              title: recipe.title,
              subtitle: recipe.subtitle,
              cta: recipe.cta,
              imagePosition: recipe.imagePosition,
              mark: recipe.showLogo ? "auto" : "none",
            });
            return (
              <section
                key={templateId}
                className="w-80 max-w-full space-y-2 rounded-lg border p-3"
              >
                <h4 className="text-sm font-medium">
                  {
                    COMPOSITION_TEMPLATES.find((t) => t.id === templateId)
                      ?.label
                  }
                </h4>
                <Artwork
                  src={`/api/lab/copy/preview?${params}`}
                  label={templateId}
                />
                <CompositionGuide templateId={templateId} />
              </section>
            );
          })}
      </div>
    </section>
  );
}

export function CompositionGuide({
  templateId,
}: {
  templateId: CompositionTemplateId;
}) {
  const guide =
    templateId in CATALOG_COPY_INTENTS
      ? CATALOG_COPY_INTENTS[templateId as keyof typeof CATALOG_COPY_INTENTS]
      : null;
  const template = COMPOSITION_TEMPLATES.find((t) => t.id === templateId)!;
  return (
    <div className="space-y-1 text-xs">
      <p className="font-medium">Copy guidance</p>
      {guide && (
        <p>
          Headline lead: {guide.headlineChars} characters · {guide.pills}{" "}
          amenity pills{guide.placeSuffix ? " · location suffix" : ""}
        </p>
      )}
      <p className="line-clamp-3 text-muted-foreground">
        {guide?.intent ?? template.description}
      </p>
      <details>
        <summary className="cursor-pointer text-muted-foreground">
          Full guidance and fields
        </summary>
        <p className="mt-1">{guide?.intent ?? template.description}</p>
        <p className="mt-1">
          Fields:{" "}
          {getCompositionFields(templateId)
            .map((f) => f.label)
            .join(" · ")}
        </p>
      </details>
    </div>
  );
}
