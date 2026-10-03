export const OG_LAYOUTS = [
  { value: "brand", label: "Brand" },
  { value: "centered", label: "Centered" },
  { value: "split", label: "Split photo" },
  { value: "editorial", label: "Editorial photo" },
] as const;

export const OG_FORMATS = [
  { value: "landscape", label: "Landscape · 1200 × 630" },
  { value: "square", label: "Square · 1200 × 1200" },
] as const;

// Public, repository-owned assets only. Query input never becomes a fetch URL
// or filesystem path in the public renderer.
export const OG_IMAGES = [
  { value: "none", label: "No photo", path: "" },
  { value: "wander-home", label: "Wander home", path: "/auth-hero.jpg" },
] as const;

export type OgOptions = {
  title: string;
  description: string;
  eyebrow: string;
  footer: string;
  layout: (typeof OG_LAYOUTS)[number]["value"];
  format: (typeof OG_FORMATS)[number]["value"];
  image: (typeof OG_IMAGES)[number]["value"];
};

export type OgPreset = { label: string; path: string; options: OgOptions };

export const DEFAULT_OG_OPTIONS: OgOptions = {
  title: "Wander Growth",
  description: "",
  eyebrow: "",
  footer: "",
  layout: "brand",
  format: "square",
  image: "none",
};

export const OG_PRESETS: OgPreset[] = [
  { label: "Growth", path: "/", options: DEFAULT_OG_OPTIONS },
  {
    label: "Campaigns",
    path: "/app/campaigns",
    options: {
      ...DEFAULT_OG_OPTIONS,
      title: "Plan the next campaign",
      eyebrow: "Campaigns",
      layout: "editorial",
      image: "wander-home",
    },
  },
  {
    label: "Content studio",
    path: "/app/studio",
    options: {
      ...DEFAULT_OG_OPTIONS,
      title: "Make room for the next story",
      description: "Shape content for every channel.",
      eyebrow: "Content studio",
      layout: "editorial",
      image: "wander-home",
    },
  },
  {
    label: "Performance",
    path: "/app/performance",
    options: {
      ...DEFAULT_OG_OPTIONS,
      title: "A clearer view of performance",
      description: "Review campaigns and prospect activity.",
      eyebrow: "Performance",
      layout: "brand",
    },
  },
];

export function readOgOptions(params: URLSearchParams): OgOptions {
  return {
    title: (params.get("title")?.trim() || "Wander Growth").slice(0, 80),
    description: (params.get("description") || "").slice(0, 140),
    eyebrow: (params.get("eyebrow") || "").slice(0, 28),
    footer: (params.get("footer") ?? DEFAULT_OG_OPTIONS.footer).slice(0, 60),
    layout:
      OG_LAYOUTS.find((item) => item.value === params.get("layout"))?.value ??
      "brand",
    format: params.get("format") === "landscape" ? "landscape" : "square",
    image:
      OG_IMAGES.find((item) => item.value === params.get("image"))?.value ??
      "none",
  };
}

export function studioImageUrl(options: OgOptions): string {
  return `/api/og?${new URLSearchParams({ ...options, design: "2" }).toString()}`;
}

export function ogSize(format: OgOptions["format"]) {
  return { width: 1200, height: format === "square" ? 1200 : 630 };
}
