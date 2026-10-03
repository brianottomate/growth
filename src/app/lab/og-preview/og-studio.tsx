"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Download, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_OG_OPTIONS,
  OG_FORMATS,
  OG_IMAGES,
  OG_LAYOUTS,
  studioImageUrl,
  type OgOptions,
  type OgPreset,
} from "@/lib/og-studio";

function ImagePreview({
  url,
  title,
  square = false,
}: {
  url: string;
  title: string;
  square?: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) setStatus(image.naturalWidth > 0 ? "ready" : "error");
  }, []);
  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-muted ${square ? "aspect-square" : "aspect-[1200/630]"}`}
    >
      <img
        ref={imageRef}
        src={url}
        alt={title}
        width={1200}
        height={square ? 1200 : 630}
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
            ? "The image could not render. Refresh to try again."
            : "Rendering preview…"}
        </div>
      )}
    </div>
  );
}

export function OgStudio({ presets }: { presets: OgPreset[] }) {
  const [options, setOptions] = useState<OgOptions>(DEFAULT_OG_OPTIONS);
  const [rendered, setRendered] = useState(options);
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState("preview");
  const [filter, setFilter] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setRendered(options), 350);
    return () => clearTimeout(timer);
  }, [options]);
  const url = studioImageUrl(rendered);
  const previewUrl = `${url}&refresh=${refresh}`;
  const update = <K extends keyof OgOptions>(key: K, value: OgOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));
  const apply = (preset: OgPreset) => {
    setOptions(preset.options);
    setTab("preview");
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Clipboard unavailable. Open the image to copy its URL.");
    }
  };
  const filtered = presets.filter((preset) =>
    `${preset.label} ${preset.path}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );

  return (
    <main className="@container mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/admin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Team tools
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            OG Studio
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Create Wander Growth share cards. Edit the copy, compare layouts,
            and download a PNG. Page metadata changes through its normal code
            review.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/lab/og-map">
            <ExternalLink />
            Wander.com metadata audit
          </Link>
        </Button>
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="preview">Editor</TabsTrigger>
          <TabsTrigger value="wall">Preset wall ({presets.length})</TabsTrigger>
          <TabsTrigger value="media">Brand assets</TabsTrigger>
        </TabsList>
        <TabsContent value="preview" className="mt-6">
          <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[320px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Design a share card</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Start from a preset</Label>
                  <SimpleSelect
                    aria-label="Start from a preset"
                    value=""
                    placeholder="Choose a page"
                    options={presets.map((preset, index) => ({
                      value: String(index),
                      label: preset.label,
                    }))}
                    onValueChange={(value) => {
                      const preset = presets[Number(value)];
                      if (preset) apply(preset);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="og-title">
                    Title ({options.title.length}/80)
                  </Label>
                  <Textarea
                    id="og-title"
                    rows={3}
                    maxLength={80}
                    value={options.title}
                    onChange={(event) => update("title", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="og-description">
                    Description ({options.description.length}/140)
                  </Label>
                  <Textarea
                    id="og-description"
                    rows={3}
                    maxLength={140}
                    value={options.description}
                    onChange={(event) =>
                      update("description", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="og-eyebrow">Eyebrow</Label>
                  <Input
                    id="og-eyebrow"
                    maxLength={28}
                    value={options.eyebrow}
                    onChange={(event) => update("eyebrow", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="og-footer">Footer</Label>
                  <Input
                    id="og-footer"
                    maxLength={60}
                    value={options.footer}
                    onChange={(event) => update("footer", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Layout</Label>
                  <SimpleSelect
                    aria-label="Layout"
                    value={options.layout}
                    options={[...OG_LAYOUTS]}
                    onValueChange={(value) => {
                      const layout = OG_LAYOUTS.find(
                        (item) => item.value === value,
                      );
                      if (layout) update("layout", layout.value);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <SimpleSelect
                    aria-label="Format"
                    value={options.format}
                    options={[...OG_FORMATS]}
                    onValueChange={(value) =>
                      update(
                        "format",
                        value === "square" ? "square" : "landscape",
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Photo</Label>
                  <SimpleSelect
                    aria-label="Photo"
                    value={options.image}
                    options={OG_IMAGES.map((image) => ({
                      value: image.value,
                      label: image.label,
                    }))}
                    disabled={
                      options.layout === "brand" ||
                      options.layout === "centered"
                    }
                    onValueChange={(value) =>
                      update(
                        "image",
                        value === "wander-home" ? "wander-home" : "none",
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Split and editorial layouts use the selected photo. With no
                    photo, they render on the brand background.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setOptions(DEFAULT_OG_OPTIONS)}
                >
                  Reset design
                </Button>
              </CardContent>
            </Card>
            <div className="min-w-0 space-y-6">
              <ImagePreview
                key={previewUrl}
                url={previewUrl}
                title={rendered.title}
                square={rendered.format === "square"}
              />
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href={`${url}&download=1`}>
                    <Download />
                    Download PNG
                  </a>
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void copy(new URL(url, window.location.origin).toString())
                  }
                >
                  <Copy />
                  Copy image URL
                </Button>
                <Button variant="outline" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Open image
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  <RefreshCw />
                  Refresh
                </Button>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Image URL</CardTitle>
                </CardHeader>
                <CardContent>
                  <code className="block text-xs break-all text-muted-foreground">
                    {url}
                  </code>
                  <p className="mt-3 text-sm text-muted-foreground">
                    This public image URL contains the copy you enter. Use copy
                    suitable for sharing.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Compare formats</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 items-start gap-4 @xl:grid-cols-2">
                  {OG_FORMATS.map((format) => {
                    const comparison = studioImageUrl({
                      ...rendered,
                      format: format.value,
                    });
                    return (
                      <div key={format.value} className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {format.label}
                        </p>
                        <ImagePreview
                          key={comparison}
                          url={comparison}
                          title={`${rendered.title} (${format.value})`}
                          square={format.value === "square"}
                        />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="wall" className="mt-6 space-y-5">
          <div className="max-w-md space-y-2">
            <Label htmlFor="preset-filter">Find a page</Label>
            <Input
              id="preset-filter"
              placeholder="Search presets and blog posts"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-5 @xl:grid-cols-2 @5xl:grid-cols-3">
            {filtered.map((preset) => (
              <Card key={preset.path}>
                <CardContent className="space-y-3 pt-6">
                  <ImagePreview
                    url={studioImageUrl(preset.options)}
                    title={preset.label}
                  />
                  <div>
                    <h2 className="text-sm font-medium">{preset.label}</h2>
                    <p className="text-xs text-muted-foreground">
                      {preset.path}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => apply(preset)}>
                      Edit design
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={preset.path} target="_blank">
                        Open page
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No presets match your search.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Presets are starting designs. Blog presets use the published article
            copy; compare the live page before changing its metadata.
          </p>
        </TabsContent>
        <TabsContent value="media" className="mt-6 space-y-5">
          <p className="text-sm text-muted-foreground">
            Repository-owned photography available to the share-card renderer.
          </p>
          <div className="grid grid-cols-1 gap-5 @xl:grid-cols-3">
            {OG_IMAGES.filter((image) => image.path).map((image) => (
              <Card key={image.value}>
                <CardContent className="space-y-3 pt-6">
                  <img
                    src={image.path}
                    alt={image.label}
                    width={600}
                    height={400}
                    className="aspect-[3/2] w-full rounded-lg object-cover"
                  />
                  <h2 className="text-sm font-medium">{image.label}</h2>
                  <Button
                    onClick={() => {
                      setOptions((current) => ({
                        ...current,
                        image: image.value,
                        layout: "editorial",
                      }));
                      setTab("preview");
                    }}
                  >
                    Use in design
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button variant="outline" asChild>
            <Link href="/app/media">Open team media library</Link>
          </Button>
        </TabsContent>
      </Tabs>
    </main>
  );
}
