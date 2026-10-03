"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_OG_OPTIONS,
  studioImageUrl,
  type OgOptions,
  type OgPreset,
} from "@/lib/og-studio";

function ImagePreview({ url, title }: { url: string; title: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) setStatus(image.naturalWidth > 0 ? "ready" : "error");
  }, []);
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
      <img
        ref={imageRef}
        src={url}
        alt={title}
        width={1200}
        height={1200}
        className="size-full object-contain"
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
      />
      {status !== "ready" && (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center bg-background/90 p-4 text-center text-sm text-muted-foreground"
        >
          {status === "error"
            ? "Could not render the card. Try changing the look."
            : "Rendering…"}
        </div>
      )}
    </div>
  );
}

export function OgStudio({ presets }: { presets: OgPreset[] }) {
  const [options, setOptions] = useState<OgOptions>(DEFAULT_OG_OPTIONS);
  const [rendered, setRendered] = useState(options);
  const [presetIndex, setPresetIndex] = useState("0");
  const [large, setLarge] = useState(false);
  const [view, setView] = useState("wall");
  const designs = presets.flatMap((preset) =>
    [false, true].map((withPhoto) => ({
      label: preset.label,
      path: preset.path,
      look: withPhoto ? "Photo" : "Type",
      options: {
        ...preset.options,
        format: "square" as const,
        eyebrow: "",
        footer: "",
        layout: withPhoto ? ("editorial" as const) : ("brand" as const),
        image: withPhoto ? ("wander-home" as const) : ("none" as const),
      },
    })),
  );
  useEffect(() => {
    const timer = setTimeout(() => setRendered(options), 250);
    return () => clearTimeout(timer);
  }, [options]);
  const url = studioImageUrl(rendered);
  const photo = options.image === "wander-home";
  const update = <K extends keyof OgOptions>(key: K, value: OgOptions[K]) => {
    setPresetIndex("");
    setOptions((current) => ({ ...current, [key]: value }));
  };
  const chooseLook = (withPhoto: boolean) => {
    setPresetIndex("");
    setOptions((current) => ({
      ...current,
      layout: withPhoto ? "editorial" : "brand",
      image: withPhoto ? "wander-home" : "none",
    }));
  };
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(
        new URL(url, window.location.origin).toString(),
      );
      toast.success("Image URL copied");
    } catch {
      toast.error("Open the image to copy its URL.");
    }
  };

  return (
    <main className="@container mx-auto max-w-5xl p-5 sm:p-8">
      <header className="mb-8 space-y-3">
        <Link
          href="/app/admin"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Team tools
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Share cards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create square share images for team chat.
          </p>
        </div>
      </header>
      <Tabs value={view} onValueChange={setView}>
        <TabsList className="mb-6">
          <TabsTrigger value="wall">Wall ({designs.length})</TabsTrigger>
          <TabsTrigger value="editor">Editor</TabsTrigger>
        </TabsList>
        <TabsContent value="wall">
          <div className="grid grid-cols-1 gap-6 @xl:grid-cols-2 @4xl:grid-cols-3">
            {designs.map((design) => (
              <article
                key={`${design.path}-${design.look}`}
                className="min-w-0 space-y-3"
              >
                <button
                  type="button"
                  aria-label={`Edit ${design.label} ${design.look} card`}
                  className="block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setOptions(design.options);
                    setPresetIndex("");
                    setView("editor");
                  }}
                >
                  <ImagePreview
                    url={studioImageUrl(design.options)}
                    title={`${design.label} · ${design.look}`}
                  />
                </button>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-medium">
                      {design.label}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {design.look} · Square
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="icon-sm">
                    <a
                      href={`${studioImageUrl(design.options)}&download=1`}
                      aria-label={`Download ${design.label} ${design.look} card`}
                    >
                      <Download />
                    </a>
                  </Button>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Click a design to edit it. These are starting designs; page metadata
            updates through code review.
          </p>
        </TabsContent>
        <TabsContent value="editor">
          <div className="grid grid-cols-1 items-start gap-8 @3xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)] @3xl:gap-12">
            <section aria-label="Card editor" className="min-w-0 space-y-6">
              <div className="space-y-2">
                <Label>Start from a page</Label>
                <SimpleSelect
                  aria-label="Start from a page"
                  className="w-full"
                  value={presetIndex}
                  placeholder="Custom card"
                  options={presets.map((preset, index) => ({
                    value: String(index),
                    label: preset.label,
                  }))}
                  onValueChange={(value) => {
                    const preset = presets[Number(value)];
                    if (preset) {
                      setPresetIndex(value);
                      setOptions({
                        ...preset.options,
                        format: "square",
                        eyebrow: "",
                        footer: "",
                        layout:
                          preset.options.image === "wander-home"
                            ? "editorial"
                            : "brand",
                      });
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="share-title">Title</Label>
                  <span className="text-xs text-muted-foreground">
                    {options.title.length}/80
                  </span>
                </div>
                <Textarea
                  id="share-title"
                  rows={3}
                  maxLength={80}
                  value={options.title}
                  placeholder="Give the card a clear title"
                  onChange={(event) => update("title", event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Short titles stay readable in a small preview.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="share-description">
                  Description{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Textarea
                  id="share-description"
                  rows={2}
                  maxLength={140}
                  value={options.description}
                  placeholder="Add a little context"
                  onChange={(event) =>
                    update("description", event.target.value)
                  }
                />
              </div>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Look</legend>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    aria-pressed={!photo}
                    onClick={() => chooseLook(false)}
                    className={`overflow-hidden rounded-lg border p-1 text-left transition-colors ${!photo ? "border-foreground" : "border-border hover:border-foreground/40"}`}
                  >
                    <div className="flex aspect-[2/1] items-center rounded-md bg-foreground px-4 text-xl font-semibold tracking-tight text-background">
                      Growth.
                    </div>
                    <span className="block px-2 py-2 text-xs font-medium">
                      Type
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={photo}
                    onClick={() => chooseLook(true)}
                    className={`overflow-hidden rounded-lg border p-1 text-left transition-colors ${photo ? "border-foreground" : "border-border hover:border-foreground/40"}`}
                  >
                    <img
                      src="/auth-hero.jpg"
                      alt=""
                      width={240}
                      height={120}
                      className="aspect-[2/1] w-full rounded-md object-cover"
                    />
                    <span className="block px-2 py-2 text-xs font-medium">
                      Photo
                    </span>
                  </button>
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href={`${url}&download=1`}>
                    <Download />
                    Download PNG
                  </a>
                </Button>
                <Button variant="outline" onClick={() => void copyUrl()}>
                  <Copy />
                  Copy URL
                </Button>
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">
                  More options
                </summary>
                <div className="mt-3 flex flex-wrap gap-3">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Open full image
                    <ExternalLink className="size-3" />
                  </a>
                  <a
                    href={`${studioImageUrl({ ...rendered, format: "landscape" })}&download=1`}
                    className="hover:text-foreground"
                  >
                    Download landscape
                  </a>
                  <Link href="/lab/og-map" className="hover:text-foreground">
                    Metadata audit
                  </Link>
                </div>
                <p className="mt-3">
                  Card URLs are public. Page metadata updates through code
                  review.
                </p>
              </details>
            </section>
            <section
              aria-label="Chat preview"
              className="order-first min-w-0 @3xl:order-last"
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {large ? "Larger preview" : "At chat size"}
                </p>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setLarge((value) => !value)}
                >
                  {large ? "Chat size" : "Larger"}
                </Button>
              </div>
              <div className="rounded-xl border bg-card p-5 text-card-foreground">
                <div className="border-l-2 border-border pl-4">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Wander Growth
                  </p>
                  <p className="text-sm font-semibold">
                    {rendered.title || "Wander Growth"}
                  </p>
                  {rendered.description && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rendered.description}
                    </p>
                  )}
                  <div
                    className={`mt-3 max-w-full ${large ? "w-[360px]" : "w-[240px]"}`}
                  >
                    <ImagePreview
                      key={url}
                      url={url}
                      title={rendered.title || "Wander Growth"}
                    />
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                1200 × 1200 PNG. Preview approximates a compact chat unfurl.
              </p>
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
