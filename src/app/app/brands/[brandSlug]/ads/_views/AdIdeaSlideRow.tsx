"use client";
import { AdSlideCopy } from "./AdSlideCopy";
import { CompositionSelector } from "@/components/composition-picker";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dropzone } from "@/components/ui/dropzone";
import { StorySafeZone } from "./StorySafeZone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPOSITION_IMAGE_POSITIONS,
  COMPOSITION_TEMPLATES,
  STUDIO_ONLY_TEMPLATES,
  getCompositionFields,
  getCompositionFormat,
} from "@/lib/compositions";
import {
  IDEA_SHAPE_LABELS,
  ideaEditorPreviewUrl,
  ideaRecipe,
  ideaSource,
  patchIdeaRecipe,
} from "@/lib/ad-idea-studio";
import type { IdeaImage, IdeaRecipe, IdeaShape } from "@/lib/ad-idea-studio";

export function AdIdeaSlideRow({
  card,
  brandId,
  name,
  shape,
  index,
  count,
  isStatic,
  uploading,
  progress,
  onChange,
  onReplace,
  onUpload,
  onMove,
  onRemove,
  editing,
  onEdit,
  frozenUrl,
  photoPanel,
  adCopy,
}: {
  /** The ad's shared copy, which a carousel slide inherits where blank. */
  adCopy: { headline: string; description?: string };
  editing: boolean;
  /** Shown in place of the slide's details while its photo is being changed. */
  photoPanel?: ReactNode;
  frozenUrl?: string;
  onEdit: () => void;
  card: IdeaImage;
  brandId: string;
  name: string;
  shape: IdeaShape;
  index: number;
  count: number;
  isStatic: boolean;
  uploading: number;
  progress: { key: string; name: string; fraction: number }[];
  onChange: (fn: (current: IdeaImage) => IdeaImage) => void;
  onReplace: () => void;
  onUpload: (files: File[]) => Promise<void>;
  onMove: (direction: number) => void;
  onRemove: () => void;
}) {
  const updateCard = onChange;
  const recipe = ideaRecipe(card, shape);
  const updateRecipe = (patch: Partial<IdeaRecipe>) =>
    updateCard((c) => patchIdeaRecipe(c, shape, patch));
  const awaitingArtwork = ideaSource(card, shape) === null;
  const preview = frozenUrl ?? ideaEditorPreviewUrl(brandId, card, shape) ?? "";
  const [previewUrl, setPreviewUrl] = useState(preview);
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewUrl(preview);
      setPreviewFailed(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [preview]);
  const dimensions = getCompositionFormat(shape);
  const needsTitle =
    card.mode === "compose" &&
    recipe.templateId !== "photo-only" &&
    !recipe.title.trim();
  const imageSettings = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={recipe.imagePosition}
        onValueChange={(value) =>
          updateRecipe({
            imagePosition: value as IdeaRecipe["imagePosition"],
          })
        }
      >
        <SelectTrigger aria-label="Image crop focus">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COMPOSITION_IMAGE_POSITIONS.map((p) => (
            <SelectItem key={p} value={p}>
              Crop focus: {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {card.mode === "compose" && (
        <>
          {getCompositionFields(recipe.templateId).some(
            (f) => f.key === "mark",
          ) && (
            <label className="flex items-center gap-2 text-xs">
              <Switch
                aria-label="Brand logo"
                checked={recipe.showLogo}
                onCheckedChange={(showLogo) => updateRecipe({ showLogo })}
              />
              Brand logo
            </label>
          )}
        </>
      )}
    </div>
  );
  return (
    <section
      aria-label={isStatic ? "Ad image" : `Slide ${index + 1}`}
      className="@container/slide-editor min-w-0 rounded-lg border p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {" "}
        <h4 className="text-xs font-medium text-muted-foreground">
          {isStatic ? "Image" : `Slide ${index + 1}`}
        </h4>
      </div>
      <div className="grid grid-cols-1 items-stretch gap-5 @min-[44rem]/slide-editor:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <div className="flex justify-center">
            <div className="w-full max-w-xs">
              <div
                className={`relative w-full overflow-hidden border bg-muted ${isStatic ? "rounded-lg" : "rounded-t-lg"}`}
                style={{
                  aspectRatio: `${dimensions.width}/${dimensions.height}`,
                }}
              >
                {awaitingArtwork && !editing ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Awaiting artwork for this size
                  </p>
                ) : awaitingArtwork ? (
                  <Dropzone
                    title="Awaiting artwork"
                    hint="Drop an image for this size, or choose one below"
                    multiple={false}
                    uploading={uploading}
                    progress={progress}
                    onFiles={async (files) => onUpload(files.slice(0, 1))}
                  />
                ) : previewFailed ? (
                  <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
                    Preview unavailable. Check the source image and try another
                    template.
                  </div>
                ) : previewUrl ? (
                  <Image
                    unoptimized
                    loading="lazy"
                    fill
                    src={previewUrl}
                    alt={`${name} · slide ${index + 1} — ${IDEA_SHAPE_LABELS[shape]} preview`}
                    className="object-contain"
                    onError={() => setPreviewFailed(true)}
                  />
                ) : null}
                {shape === "story" &&
                previewUrl &&
                !previewFailed &&
                !awaitingArtwork ? (
                  <StorySafeZone />
                ) : null}
              </div>
              {!isStatic && (
                <AdSlideCopy
                  headline={card.copy?.headline?.trim() || adCopy.headline}
                  description={
                    card.copy?.description?.trim() || adCopy.description
                  }
                />
              )}
            </div>
          </div>

          {needsTitle && !awaitingArtwork && (
            <p className="text-xs text-muted-foreground">
              Showing the source photo. Add composition text to preview the
              overlay.
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {photoPanel && !editing ? (
            photoPanel
          ) : !editing ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {card.mode === "supplied"
                    ? "Artwork"
                    : `Composed · ${
                        COMPOSITION_TEMPLATES.find(
                          (t) => t.id === recipe.templateId,
                        )?.label ?? recipe.templateId
                      }`}
                </span>
              </div>
              {card.mode === "compose" ? (
                <div className="space-y-3">
                  <h5 className="text-xs font-medium">Image text</h5>
                  <dl className="space-y-3 text-sm">
                    {getCompositionFields(recipe.templateId)
                      .filter((f) =>
                        ["title", "subtitle", "eyebrow", "cta"].includes(f.key),
                      )
                      .map((field) => (
                        <div key={field.key}>
                          <dt className="text-xs text-muted-foreground">
                            {field.key === "title"
                              ? "Image headline"
                              : field.label}
                          </dt>
                          <dd className="break-words whitespace-pre-wrap">
                            {recipe[
                              field.key as
                                | "title"
                                | "subtitle"
                                | "eyebrow"
                                | "cta"
                            ] || "Not set"}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </div>
              ) : null}
              <div
                role="group"
                aria-label="Quick actions"
                className="mt-auto flex flex-wrap justify-start gap-2 border-t pt-3"
              >
                <Button size="sm" variant="ghost" onClick={onReplace}>
                  {awaitingArtwork ? "Choose image" : "Change image"}
                </Button>
              </div>
              <div
                role="group"
                aria-label="Slide actions"
                className="flex flex-wrap items-center justify-end gap-2"
              >
                <div className="flex flex-wrap gap-1">
                  {!editing && (
                    <>
                      {" "}
                      {!isStatic && (
                        <>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Move slide earlier"
                            title="Move slide earlier"
                            disabled={index === 0}
                            onClick={() => onMove(-1)}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Move slide later"
                            title="Move slide later"
                            disabled={index === count - 1}
                            onClick={() => onMove(1)}
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={
                          isStatic
                            ? "Remove image from all sizes"
                            : "Remove slide from all sizes"
                        }
                        title={
                          isStatic
                            ? "Remove image from all sizes"
                            : "Remove slide from all sizes"
                        }
                        onClick={onRemove}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={onEdit}>
                  {isStatic ? "Edit image" : "Edit slide"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div
                role="group"
                aria-label="Image mode"
                className="flex flex-wrap gap-2"
              >
                <Button
                  size="sm"
                  variant={card.mode === "supplied" ? "secondary" : "outline"}
                  aria-pressed={card.mode === "supplied"}
                  onClick={() =>
                    updateCard((c) => ({ ...c, mode: "supplied" }))
                  }
                >
                  Artwork
                </Button>
                <Button
                  size="sm"
                  variant={card.mode === "compose" ? "secondary" : "outline"}
                  aria-pressed={card.mode === "compose"}
                  onClick={() => updateCard((c) => ({ ...c, mode: "compose" }))}
                >
                  Composed
                </Button>
              </div>
              {card.mode === "supplied" ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Use this image without adding text or a logo. Preview the
                    crop in each shape.
                  </p>
                  {imageSettings}
                </>
              ) : (
                <>
                  <CompositionSelector
                    value={recipe.templateId}
                    aspectRatio={`${dimensions.width} / ${dimensions.height}`}
                    onChange={(templateId) => updateRecipe({ templateId })}
                    options={COMPOSITION_TEMPLATES.filter(
                      (template) =>
                        template.id !== "photo-only" &&
                        !STUDIO_ONLY_TEMPLATES.has(template.id),
                    ).map((template) => ({
                      id: template.id,
                      label: template.label,
                      previewUrl: ideaEditorPreviewUrl(
                        brandId,
                        patchIdeaRecipe(card, shape, {
                          templateId: template.id,
                        }),
                        shape,
                      ),
                    }))}
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(card.overrides[shape])}
                      onChange={(e) =>
                        updateCard((c) => {
                          const overrides = { ...c.overrides };
                          if (e.target.checked)
                            overrides[shape] = { ...c.recipe };
                          else delete overrides[shape];
                          return { ...c, overrides };
                        })
                      }
                    />
                    Use separate settings for {IDEA_SHAPE_LABELS[shape]}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {card.overrides[shape]
                      ? "Changes apply only to this size."
                      : "Changes apply to all sizes using shared settings. Layout adapts automatically."}
                  </p>
                  {imageSettings}
                  {getCompositionFields(recipe.templateId)
                    .filter((f) =>
                      ["title", "subtitle", "eyebrow", "cta"].includes(f.key),
                    )
                    .map((field) => {
                      const key = field.key as
                        | "title"
                        | "subtitle"
                        | "eyebrow"
                        | "cta";
                      return (
                        <label key={key} className="block space-y-1 text-xs">
                          {key === "title" ? "Image headline" : field.label}
                          <Input
                            value={recipe[key]}
                            maxLength={
                              {
                                title: 120,
                                subtitle: 220,
                                eyebrow: 40,
                                cta: 60,
                              }[key]
                            }
                            onChange={(e) =>
                              updateRecipe({ [key]: e.target.value })
                            }
                          />
                        </label>
                      );
                    })}
                </>
              )}

              {!isStatic && (
                <div className="space-y-3 border-t pt-3">
                  <h5 className="text-xs font-medium">Slide ad copy</h5>
                  {(["headline", "description"] as const).map((key) => (
                    <label key={key} className="block space-y-1 text-xs">
                      {key === "headline" ? "Headline" : "Description"}
                      <Input
                        value={card.copy?.[key] ?? ""}
                        maxLength={key === "headline" ? 300 : 120}
                        placeholder={
                          key === "headline"
                            ? "Blank uses the ad's headline"
                            : "Blank uses the ad's description"
                        }
                        onChange={(e) =>
                          updateCard((c) => ({
                            ...c,
                            copy: { ...c.copy, [key]: e.target.value },
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              )}

              <div className="space-y-3 border-t pt-3">
                <h5 className="text-xs font-medium">Image</h5>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={onReplace}>
                      Choose image
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={awaitingArtwork}
                      onClick={() =>
                        updateCard((c) => ({
                          ...c,
                          sourceOverrides: {
                            ...c.sourceOverrides,
                            [shape]: null,
                          },
                        }))
                      }
                    >
                      Remove image for this size
                    </Button>
                    {card.sourceOverrides?.[shape] !== undefined && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateCard((c) => {
                            const sourceOverrides = { ...c.sourceOverrides };
                            delete sourceOverrides[shape];
                            return { ...c, sourceOverrides };
                          })
                        }
                      >
                        Use base image
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
