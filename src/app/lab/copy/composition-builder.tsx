"use client";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import {
  COPY_LAB_COMPOSITION_TEMPLATES,
  fixtureHomeSuite,
  type CopyLabCompositions,
  type CopyLabHome,
} from "@/lib/copy-lab";
import type { IdeaShape } from "@/lib/ad-idea-studio";
import type { CompositionTemplateId } from "@/lib/compositions";

const placements: { shape: IdeaShape; label: string }[] = [
  { shape: "portrait", label: "Feed · 4:5" },
  { shape: "square", label: "Feed · 1:1" },
  { shape: "story", label: "Story · 9:16" },
  { shape: "wide", label: "Feed · 16:9" },
];
export function CompositionBuilder({
  value,
  home,
  photoUrl,
  automaticPhotos,
  onChange,
}: {
  value?: CopyLabCompositions;
  home?: CopyLabHome;
  photoUrl?: string;
  automaticPhotos?: boolean;
  onChange: (value: CopyLabCompositions) => void;
}) {
  const config = value ?? { static: {}, carousel: {}, slides: [] };
  const slides = home
    ? (fixtureHomeSuite(home, photoUrl).carousel?.cards ?? [])
    : [];
  const choices = COPY_LAB_COMPOSITION_TEMPLATES.map((t) => ({
    value: t.id,
    label: t.label,
  }));
  const set = (
    kind: "static" | "carousel" | "slide",
    shape: IdeaShape,
    id: string,
    index = 0,
  ) => {
    const map = { ...(kind === "slide" ? config.slides[index] : config[kind]) };
    if (id === "auto") delete map[shape];
    else map[shape] = id as CompositionTemplateId;
    onChange(
      kind === "slide"
        ? {
            ...config,
            slides: Array.from({ length: slides.length }, (_, i) =>
              i === index ? map : (config.slides[i] ?? {}),
            ),
          }
        : { ...config, [kind]: map },
    );
  };
  return (
    <details open className="rounded-lg border bg-background p-3">
      <summary className="cursor-pointer text-xs font-semibold">
        Composition templates
      </summary>
      <p className="my-2 text-xs text-muted-foreground">
        Default comparisons use the production starter layouts: hero opener and
        closer, image-hero details, and the starter image CTA. Explore custom
        compositions after comparing the copy.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onChange({
            ...config,
            mode: config.mode === "custom" ? "starter" : "custom",
          })
        }
      >
        {config.mode === "custom"
          ? "Use production starter layouts"
          : "Explore custom compositions"}
      </Button>
      {config.mode === "custom" && (
        <div className="mt-3 space-y-2">
          {placements.map((p) => (
            <details key={p.shape} className="rounded border p-2">
              <summary className="cursor-pointer text-xs font-medium">
                {p.label}
              </summary>
              <div className="mt-3 space-y-3">
                {(["static", "carousel"] as const).map((kind) => (
                  <label key={kind} className="block space-y-1 text-xs">
                    <span>
                      {kind === "static" ? "Single image" : "Carousel default"}
                    </span>
                    <SimpleSelect
                      aria-label={`${kind === "static" ? "Single image template" : "Carousel default template"} · ${p.label}`}
                      value={config[kind][p.shape] ?? "auto"}
                      options={[
                        {
                          value: "auto",
                          label:
                            kind === "static"
                              ? "Automatic · hero layout"
                              : "Automatic · hero / detail / closing",
                        },
                        ...choices,
                      ]}
                      onValueChange={(v) => set(kind, p.shape, v)}
                    />
                  </label>
                ))}
                {slides.map((slide, index) => (
                  <label key={slide.id} className="block space-y-1 text-xs">
                    <span className="flex items-center gap-2">
                      {!automaticPhotos && (
                        /* oxlint-disable-next-line nextjs/no-img-element */
                        <img
                          src={slide.source.url}
                          alt=""
                          className="h-7 w-9 rounded object-cover"
                          loading="lazy"
                        />
                      )}
                      Slide {index + 1}
                    </span>
                    <SimpleSelect
                      aria-label={`Slide ${index + 1} template · ${p.label}`}
                      value={config.slides[index]?.[p.shape] ?? "auto"}
                      options={[
                        { value: "auto", label: "Use carousel default" },
                        ...choices,
                      ]}
                      onValueChange={(v) => set("slide", p.shape, v, index)}
                    />
                  </label>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </details>
  );
}
