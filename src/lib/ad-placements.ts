import type {
  AdCard,
  AdCreativeContent,
  AdPlacementCell,
  AdPlacementVariant,
  AdPlacements,
} from "@/server/db/ads-schema";

import type { PlannableAdPlatform } from "./ad-platforms";
import type { AdFormat } from "./performance-ads";

// The placement matrix, read side. Client-safe: the wall, the matrix view
// and the push all resolve a cell through here, so what an operator sees is
// what ships.
//
// A cell is (ad, platform, placement). Its value is the base creative
// projected onto the placement's spec, unless the ad's `placements` map has
// an entry for it, in which case that entry's copy and files win. Nothing
// here writes; the verbs that override and freeze live in the ad-set service.

/** "<platform>:<placement>", the key of an ad's `placements` map. */
export type AdPlacementKey = `${PlannableAdPlatform}:${string}`;

export type AdPlacementCrop =
  | "landscape"
  | "wide"
  | "square"
  | "portrait"
  | "story";

/** The client mock that draws a placement. Ids match `AD_MOCK_SURFACES`. */
export type AdPlacementSurface = "facebook" | "instagram" | "story";

export type AdPlacementSpec = {
  key: AdPlacementKey;
  platform: PlannableAdPlatform;
  /** The placement's id within its platform. */
  placement: string;
  label: string;
  shortLabel: string;
  crop: AdPlacementCrop;
  surface: AdPlacementSurface;
  /**
   * The platform's recommended lengths. Checked, never enforced by
   * truncation: a cell over the limit shows a warning so a person decides.
   */
  copy: { headlineMax: number; bodyMax: number; ctaRequired: boolean };
  formats: readonly AdFormat[];
};

/**
 * Every placement a creative can land in. Meta only for now, which is what
 * runs today; the shape is general so LinkedIn and Google add entries with
 * their own crops and copy rules, not a schema change. Order is the matrix's
 * column order.
 */
export const AD_PLACEMENT_SPECS = [
  {
    key: "meta_ads:facebook_feed",
    platform: "meta_ads",
    placement: "facebook_feed",
    label: "Facebook feed",
    shortLabel: "FB feed",
    crop: "portrait",
    surface: "facebook",
    copy: { headlineMax: 40, bodyMax: 125, ctaRequired: true },
    formats: ["static", "carousel", "video"],
  },
  {
    key: "meta_ads:instagram_feed",
    platform: "meta_ads",
    placement: "instagram_feed",
    label: "Instagram feed",
    shortLabel: "IG feed",
    crop: "portrait",
    surface: "instagram",
    copy: { headlineMax: 40, bodyMax: 125, ctaRequired: true },
    formats: ["static", "carousel", "video"],
  },
  {
    key: "meta_ads:story",
    platform: "meta_ads",
    placement: "story",
    label: "Story / Reel",
    shortLabel: "Story",
    crop: "story",
    surface: "story",
    copy: { headlineMax: 40, bodyMax: 125, ctaRequired: false },
    formats: ["static", "carousel", "video"],
  },
  {
    // The 16:9 cut Meta serves in right column, in-stream and search. The
    // reference sets ship it beside the feed and story crops; the composition
    // re-renders on the wide canvas from the same blueprint.
    key: "meta_ads:landscape",
    platform: "meta_ads",
    placement: "landscape",
    label: "Landscape",
    shortLabel: "Landscape",
    crop: "wide",
    surface: "facebook",
    copy: { headlineMax: 40, bodyMax: 125, ctaRequired: true },
    formats: ["static", "carousel", "video"],
  },
] as const satisfies readonly AdPlacementSpec[];

/** The one placement ads drawn before the map already carried, per card. */
export const LEGACY_STORY_KEY: AdPlacementKey = "meta_ads:story";

export function placementKey(
  platform: PlannableAdPlatform,
  placement: string,
): AdPlacementKey {
  return `${platform}:${placement}`;
}

export function placementSpec(key: string): AdPlacementSpec | null {
  return AD_PLACEMENT_SPECS.find((spec) => spec.key === key) ?? null;
}

export function placementsFor(
  platform: PlannableAdPlatform,
): readonly AdPlacementSpec[] {
  return AD_PLACEMENT_SPECS.filter((spec) => spec.platform === platform);
}

/**
 * The old per-card `story` slot read as a cell, so an ad drawn before the map
 * resolves exactly as it did. Null when no card carries one.
 */
export function legacyStoryCell(
  content: AdCreativeContent,
): AdPlacementCell | null {
  const cards = content.media.map((card) => card.story ?? null);
  if (!cards.some((card) => card !== null)) return null;
  return { cards };
}

export type AdCellState = "rendered" | "overridden" | "frozen";

/** Frozen beats overridden beats rendered; an entry with nothing in it renders. */
export function cellState(
  cell: AdPlacementCell | null | undefined,
): AdCellState {
  if (!cell) return "rendered";
  if (cell.frozenAt) return "frozen";
  const hasCopy = Boolean(cell.copy && Object.keys(cell.copy).length > 0);
  const hasCards = Boolean(cell.cards?.some((card) => card !== null));
  return hasCopy || hasCards ? "overridden" : "rendered";
}

export type ResolvedCopy = {
  headline: string;
  body: string;
  callToAction: string | null;
  linkUrl: string | null;
};

export type ResolvedCard = {
  url: string;
  thumbnail: string | null;
  type: AdCard["type"];
  assetId: string | null;
  /** How the shown file came to be; "base" is a live crop of the base card. */
  via: AdPlacementVariant["via"] | "base";
};

export type CopyFit = { ok: boolean; issues: string[] };

export type ResolvedCell = {
  key: AdPlacementKey;
  spec: AdPlacementSpec;
  state: AdCellState;
  copy: ResolvedCopy;
  cards: ResolvedCard[];
  fit: CopyFit;
  frozenAt: string | null;
  via: NonNullable<AdPlacementCell["via"]> | null;
};

/** What the matrix and the push read from: the base plus whatever cells exist. */
export type PlaceableAd = {
  content: AdCreativeContent;
  placements?: AdPlacements | null;
};

export function copyFits(copy: ResolvedCopy, spec: AdPlacementSpec): CopyFit {
  const issues: string[] = [];
  if (copy.headline.length > spec.copy.headlineMax) {
    issues.push(`Headline ${copy.headline.length}/${spec.copy.headlineMax}`);
  }
  if (copy.body.length > spec.copy.bodyMax) {
    issues.push(`Body ${copy.body.length}/${spec.copy.bodyMax}`);
  }
  if (spec.copy.ctaRequired && !copy.callToAction) {
    issues.push("No call to action");
  }
  return { ok: issues.length === 0, issues };
}

/** An explicit entry wins; the legacy story slot stands in for its key until migrated. */
export function cellFor(
  ad: PlaceableAd,
  key: AdPlacementKey,
): AdPlacementCell | null {
  const explicit = ad.placements?.[key];
  if (explicit) return explicit;
  if (key === LEGACY_STORY_KEY) return legacyStoryCell(ad.content);
  return null;
}

/**
 * One cell, resolved: the base copy with the cell's overrides on top, and
 * per card the cell's own file or the base card to be shown in this crop.
 */
/**
 * A composition-preview card re-rendered at a placement's crop. The URL is the
 * blueprint's recipe, so swapping `formatId` is the whole variation. Anything
 * that is not a composition preview (an uploaded file, a raw asset) is returned
 * untouched.
 */
export function withCompositionFormat(
  url: string,
  crop: AdPlacementCrop,
): string {
  if (!url.includes("/api/compositions/preview")) return url;
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set("formatId", crop);
  return `${path}?${params.toString()}`;
}

/** The line a composition card draws on the image, or "" when it is a bare photo. */
export function compositionTitle(url: string): string {
  if (!url.includes("/api/compositions/preview")) return "";
  const [, query = ""] = url.split("?");
  return new URLSearchParams(query).get("title") ?? "";
}

/**
 * A composition card with its drawn line replaced: the same recipe, a new
 * `title`. What "override the copy on the composition" writes. A blank title
 * clears the line. A bare photo or an uploaded file has no line and is
 * returned untouched.
 */
export function withTitle(url: string, title: string): string {
  if (!url.includes("/api/compositions/preview")) return url;
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  if (title) params.set("title", title);
  else params.delete("title");
  return `${path}?${params.toString()}`;
}

/** The overlay fields a branded blueprint carries; dropped to fall back to the photo. */
const OVERLAY_PARAMS = ["title", "subtitle", "eyebrow", "cta", "rating"];

/**
 * A composition card re-rendered as its bare photo: the blueprint swapped for
 * `photo-only` and the overlay fields dropped, so the source shows with nothing
 * on it. For a home whose photos are already stamped, so the ad does not double
 * up. A pinned upload or a raw asset is not a composition and is returned as is.
 */
export function withPhotoOnly(url: string): string {
  if (!url.includes("/api/compositions/preview")) return url;
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set("templateId", "photo-only");
  for (const key of OVERLAY_PARAMS) params.delete(key);
  return `${path}?${params.toString()}`;
}

export function resolveCell(
  ad: PlaceableAd,
  spec: AdPlacementSpec,
): ResolvedCell {
  const cell = cellFor(ad, spec.key);
  const base = ad.content;
  const copy: ResolvedCopy = {
    headline: cell?.copy?.headline ?? base.headline,
    body: cell?.copy?.body ?? base.body,
    callToAction: cell?.copy?.callToAction ?? base.callToAction ?? null,
    linkUrl: cell?.copy?.linkUrl ?? base.linkUrl ?? null,
  };
  // When the ad is set to photo only, every card drops its overlay and shows
  // the bare source, a card at a time, before the crop is applied.
  const photoOnly = base.photoOnly === true;
  const cards: ResolvedCard[] = base.media.map((card, index) => {
    const own = cell?.cards?.[index] ?? null;
    const shown = own ?? card;
    const shownUrl = photoOnly ? withPhotoOnly(shown.url) : shown.url;
    return {
      // A composition card carries its recipe in the URL, so the placement's
      // own crop is a formatId swap: the blueprint re-renders at 1.91:1, 1:1
      // or 9:16 with its scrim in the right place, instead of a square
      // cropped by CSS. A pinned upload or a raw asset is left as it is.
      url: withCompositionFormat(shownUrl, spec.crop),
      thumbnail: shown.thumbnail ?? null,
      type: card.type,
      assetId: shown.assetId ?? null,
      via: own ? own.via : "base",
    };
  });
  return {
    key: spec.key,
    spec,
    state: cellState(cell),
    copy,
    cards,
    fit: copyFits(copy, spec),
    frozenAt: cell?.frozenAt ?? null,
    via: cell?.via ?? null,
  };
}

/** The ad across every placement, in column order. */
export function resolveMatrix(
  ad: PlaceableAd,
  specs: readonly AdPlacementSpec[] = AD_PLACEMENT_SPECS,
): ResolvedCell[] {
  return specs.map((spec) => resolveCell(ad, spec));
}

export type Coverage = {
  total: number;
  frozen: number;
  overridden: number;
  rendered: number;
  /** Cells whose copy is over a limit or missing a required button. */
  unfit: number;
};

/** The collapsed row's numbers: how much of an ad is decided, and what is off. */
export function coverage(cells: readonly ResolvedCell[]): Coverage {
  const out: Coverage = {
    total: cells.length,
    frozen: 0,
    overridden: 0,
    rendered: 0,
    unfit: 0,
  };
  for (const cell of cells) {
    out[cell.state] += 1;
    if (!cell.fit.ok) out.unfit += 1;
  }
  return out;
}
