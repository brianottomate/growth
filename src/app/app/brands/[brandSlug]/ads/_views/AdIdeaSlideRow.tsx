"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropzone } from "@/components/ui/dropzone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPOSITION_TEMPLATES,
  getCompositionFields,
  getCompositionFormat,
} from "@/lib/compositions";
import {
  IDEA_SHAPE_LABELS,
  ideaEditorPreviewUrl,
  ideaRecipe,
  ideaSource,
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
  onChoosePool,
  editing,
  onEdit,
  frozenUrl,
}: {
  editing: boolean;
  frozenUrl?: string | null;
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
  onChoosePool: () => void;
}) {
  const updateCard = onChange;
  const recipe = ideaRecipe(card, shape);
  const updateRecipe = (patch: Partial<IdeaRecipe>) =>
    updateCard((c) =>
      c.overrides[shape]
        ? {
            ...c,
            overrides: {
              ...c.overrides,
              [shape]: { ...ideaRecipe(c, shape), ...patch },
            },
          }
        : { ...c, recipe: { ...c.recipe, ...patch } },
    );
  const awaitingArtwork = ideaSource(card, shape) === null;
  const preview =
    frozenUrl === undefined
      ? (ideaEditorPreviewUrl(brandId, card, shape) ?? "")
      : (frozenUrl ?? "");
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
  return (
    <section
      aria-label={isStatic ? "Ad image" : `Slide ${index + 1}`}
      className="rounded-lg border p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {" "}
        <h4 className="mb-3 text-xs font-medium text-muted-foreground">
          {isStatic ? "Image" : `Slide ${index + 1}`}
        </h4>
        <div className="flex flex-wrap gap-1">
          {!editing && (
            <>
              {" "}
              {!isStatic && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => onMove(-1)}
                  >
                    Move earlier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={index === count - 1}
                    onClick={() => onMove(1)}
                  >
                    Move later
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={onRemove}>
                {isStatic
                  ? "Remove image from all sizes"
                  : "Remove slide from all sizes"}
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="flex justify-center rounded-lg bg-muted p-3">
            <div
              className="relative w-full max-w-xs overflow-hidden rounded-md"
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
            </div>
          </div>

          {needsTitle && !awaitingArtwork && (
            <p className="text-xs text-muted-foreground">
              Showing the source photo. Add composition text to preview the
              overlay.
            </p>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          {!editing ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="text-sm font-medium">
                  {card.mode === "supplied"
                    ? "Supplied artwork"
                    : (COMPOSITION_TEMPLATES.find(
                        (t) => t.id === recipe.templateId,
                      )?.label ?? "Composition")}
                </h5>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={onReplace}>
                    {awaitingArtwork ? "Choose image" : "Change image"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onEdit}>
                    {isStatic ? "Edit image" : "Edit slide"}
                  </Button>
                </div>
              </div>
              {card.mode === "compose" ? (
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  Finished artwork, with no added text or logo.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {IDEA_SHAPE_LABELS[shape]} · Crop: {recipe.imagePosition}
                {card.mode === "compose"
                  ? ` · Logo ${recipe.showLogo ? "on" : "off"}`
                  : ""}
                {card.sourceOverrides?.[shape] === null
                  ? " · Awaiting artwork"
                  : card.sourceOverrides?.[shape]
                    ? " · Custom image"
                    : " · Base image"}
              </p>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={card.mode === "supplied" ? "secondary" : "outline"}
                  onClick={() =>
                    updateCard((c) => ({ ...c, mode: "supplied" }))
                  }
                >
                  Supplied artwork
                </Button>
                <Button
                  size="sm"
                  variant={card.mode === "compose" ? "secondary" : "outline"}
                  onClick={() => updateCard((c) => ({ ...c, mode: "compose" }))}
                >
                  Compose on photo
                </Button>
              </div>
              {card.mode === "supplied" ? (
                <p className="text-xs text-muted-foreground">
                  Use this image without adding text or a logo. Preview the crop
                  in each shape.
                </p>
              ) : (
                <>
                  <Select
                    value={recipe.templateId}
                    onValueChange={(value) =>
                      updateRecipe({
                        templateId: value as IdeaRecipe["templateId"],
                      })
                    }
                  >
                    <SelectTrigger aria-label="Composition template">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPOSITION_TEMPLATES.filter(
                        (t) => t.id !== "photo-only",
                      ).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    Customize composition for {IDEA_SHAPE_LABELS[shape]}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {card.overrides[shape]
                      ? "Editing only this shape."
                      : "Editing this image’s shared composition. Each shape adapts the layout."}
                  </p>
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

              <div className="space-y-3 border-t pt-3">
                <h5 className="text-xs font-medium">
                  Image settings · {IDEA_SHAPE_LABELS[shape]}
                </h5>
                <div className="mt-3 space-y-3">
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
                      {["top", "center", "bottom"].map((p) => (
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
                          <input
                            type="checkbox"
                            checked={recipe.showLogo}
                            onChange={(e) =>
                              updateRecipe({ showLogo: e.target.checked })
                            }
                          />
                          Show brand logo
                        </label>
                      )}
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={onReplace}>
                      Replace image for this size
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
                      Clear this size
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

                    <Button size="sm" variant="outline" onClick={onChoosePool}>
                      Choose from pool for this size
                    </Button>
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
