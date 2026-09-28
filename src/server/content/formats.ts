/**
 * Format registry — the single source of truth the soft `text()` columns
 * (`platform_post.format/archetype/template`, `cadence_target.archetype/template`,
 * `content_post.targetSpots[]`) validate against. Pure data + deterministic
 * helpers, no server-only deps, so the client (dropdowns, calendar) imports it
 * too. The AI-backed template/vision step lives in `./classify` (server-only).
 *
 * TWO AXES (see content-schema):
 *   archetype = publish MECHANIC (closed-ish, soft)
 *   template  = editorial STRUCTURE (open — starters seed UI/AI, not a hard set)
 *   format    = concrete platform product, e.g. "instagram.reel"
 *
 * Amplification (repost/quote/collab) is NOT here — it's a relationship
 * (externalKind + platform_post_link), never a format value.
 */

import type { ChannelPlatform } from "@/server/db/channel-schema";

// ---- ARCHETYPE: the publish mechanic -------------------------------

export const FORMAT_ARCHETYPES = [
  "image", // single still
  "carousel", // multi-card swipe (IG carousel, LI document, TikTok photo/slideshow)
  "video_short", // vertical short-form (reel, TikTok video, Short)
  "video_long", // horizontal / long-form (YouTube, LI/FB video)
  "text", // text-first single unit (tweet, LI/FB text post)
  "thread", // ordered text sequence (X/Threads chain)
  "story", // ephemeral 24h
  "link", // link / article share
  "article", // long-form written (blog, LI article, newsletter issue)
] as const;
export type FormatArchetype = (typeof FORMAT_ARCHETYPES)[number];

export function isArchetype(x: unknown): x is FormatArchetype {
  return (
    typeof x === "string" &&
    (FORMAT_ARCHETYPES as readonly string[]).includes(x)
  );
}

// ---- TEMPLATE: editorial structure (OPEN — these only seed UI + AI) ----

export const TEMPLATE_STARTERS = [
  "gallery", // related-but-loose photos (a trip, a house from angles)
  "informational_deck", // "5 things you need to worry about" — often shared design
  "property_roundup", // N houses across an area / the country (Wander-unique)
  "listicle",
  "before_after",
  "quote_card",
  "announcement",
  "behind_the_scenes",
  "ugc", // user-generated / reposted creator content
  "testimonial",
  "how_to",
  "data_viz",
  // From the team's calendar vocabulary (best-of-both; iterate as ours wins).
  "pov", // "POV: your group chat finally agreed…"
  "talking_head", // host-to-camera guide
  "comparison", // "Wander vs hotel" split
  "road_trip", // route/drive narrative
  "guest_story", // post-stay customer story
  "destination_guide", // "48 hours in…", local edits
  "founder_pov", // origin / why-we-built-this
] as const;
export type TemplateStarter = (typeof TEMPLATE_STARTERS)[number];

// ---- PLATFORM FORMAT: the concrete product + its hard rules --------

export type MediaKind = "image" | "video";

export type PlatformFormat = {
  id: string; // "instagram.reel"
  platform: ChannelPlatform;
  archetype: FormatArchetype;
  label: string;
  surface?: "feed" | "reels" | "stories" | "explore" | "profile";
  ephemeral?: boolean;
  sequence?: boolean; // thread-like → expands into ordered child rows
  // False for campaign-driven one-offs that share a publishing surface but
  // must not satisfy its recurring cadence (for example an email blast).
  countsTowardCadence?: boolean;
  media: {
    kinds: MediaKind[];
    min?: number;
    max?: number;
    aspectRatios?: string[];
    maxDurationSec?: number;
  };
  text?: { max?: number };
};

// Constraints are best-effort v1 — refine in place; the registry is the home.
export const PLATFORM_FORMATS: PlatformFormat[] = [
  // Instagram
  {
    id: "instagram.image",
    platform: "instagram",
    archetype: "image",
    label: "Feed Image",
    surface: "feed",
    media: { kinds: ["image"], min: 1, max: 1, aspectRatios: ["1:1", "4:5"] },
  },
  {
    id: "instagram.carousel",
    platform: "instagram",
    archetype: "carousel",
    label: "Carousel",
    surface: "feed",
    media: {
      kinds: ["image", "video"],
      min: 2,
      max: 10,
      aspectRatios: ["1:1", "4:5"],
    },
  },
  {
    id: "instagram.reel",
    platform: "instagram",
    archetype: "video_short",
    label: "Reel",
    surface: "reels",
    media: {
      kinds: ["video"],
      min: 1,
      max: 1,
      aspectRatios: ["9:16"],
      maxDurationSec: 90,
    },
  },
  {
    id: "instagram.story",
    platform: "instagram",
    archetype: "story",
    label: "Story",
    surface: "stories",
    ephemeral: true,
    sequence: true,
    media: {
      kinds: ["image", "video"],
      min: 1,
      max: 1,
      aspectRatios: ["9:16"],
      maxDurationSec: 60,
    },
  },

  // TikTok — photo mode is a carousel mechanic; template carries the intent.
  {
    id: "tiktok.video",
    platform: "tiktok",
    archetype: "video_short",
    label: "Video",
    media: {
      kinds: ["video"],
      min: 1,
      max: 1,
      aspectRatios: ["9:16"],
      maxDurationSec: 600,
    },
  },
  {
    id: "tiktok.photo",
    platform: "tiktok",
    archetype: "carousel",
    label: "Photo / Slideshow",
    media: { kinds: ["image"], min: 1, max: 35, aspectRatios: ["9:16"] },
  },

  // X
  {
    id: "x.tweet",
    platform: "x",
    archetype: "text",
    label: "Tweet",
    media: { kinds: ["image", "video"], min: 0, max: 4 },
    text: { max: 280 },
  },
  {
    id: "x.thread",
    platform: "x",
    archetype: "thread",
    label: "Thread",
    sequence: true,
    media: { kinds: ["image", "video"] },
    text: { max: 280 },
  },
  {
    id: "x.video",
    platform: "x",
    archetype: "video_short",
    label: "Video Post",
    media: { kinds: ["video"], min: 1, max: 1 },
    text: { max: 280 },
  },

  // LinkedIn
  {
    id: "linkedin.post",
    platform: "linkedin",
    archetype: "text",
    label: "Post",
    media: { kinds: ["image", "video"], min: 0, max: 9 },
    text: { max: 3000 },
  },
  {
    id: "linkedin.image",
    platform: "linkedin",
    archetype: "image",
    label: "Image Post",
    media: { kinds: ["image"], min: 1, max: 9 },
    text: { max: 3000 },
  },
  {
    id: "linkedin.video",
    platform: "linkedin",
    archetype: "video_long",
    label: "Video",
    media: { kinds: ["video"], min: 1, max: 1 },
    text: { max: 3000 },
  },
  {
    id: "linkedin.document",
    platform: "linkedin",
    archetype: "carousel",
    label: "Document / Carousel",
    media: { kinds: ["image"], min: 2, max: 300 },
    text: { max: 3000 },
  },
  {
    id: "linkedin.article",
    platform: "linkedin",
    archetype: "article",
    label: "Article",
    media: { kinds: ["image"] },
  },

  // Facebook
  {
    id: "facebook.post",
    platform: "facebook",
    archetype: "text",
    label: "Post",
    media: { kinds: ["image", "video"] },
  },
  {
    id: "facebook.image",
    platform: "facebook",
    archetype: "image",
    label: "Image Post",
    surface: "feed",
    media: { kinds: ["image"], min: 1, max: 1 },
  },
  // A multi-photo Page post. Zernio takes it as one post with several
  // mediaItems; the per-card link carousel is a different Meta product.
  {
    id: "facebook.carousel",
    platform: "facebook",
    archetype: "carousel",
    label: "Carousel",
    surface: "feed",
    media: { kinds: ["image"], min: 2, max: 10, aspectRatios: ["1:1", "4:5"] },
  },
  {
    id: "facebook.video",
    platform: "facebook",
    archetype: "video_long",
    label: "Video",
    media: { kinds: ["video"], min: 1, max: 1 },
  },
  {
    id: "facebook.reel",
    platform: "facebook",
    archetype: "video_short",
    label: "Reel",
    surface: "reels",
    media: { kinds: ["video"], aspectRatios: ["9:16"], maxDurationSec: 60 },
  },
  {
    id: "facebook.story",
    platform: "facebook",
    archetype: "story",
    label: "Story",
    surface: "stories",
    ephemeral: true,
    sequence: true,
    media: {
      kinds: ["image", "video"],
      min: 1,
      max: 1,
      aspectRatios: ["9:16"],
      maxDurationSec: 120,
    },
  },

  // YouTube
  {
    id: "youtube.short",
    platform: "youtube",
    archetype: "video_short",
    label: "Short",
    media: { kinds: ["video"], aspectRatios: ["9:16"], maxDurationSec: 60 },
  },
  {
    id: "youtube.video",
    platform: "youtube",
    archetype: "video_long",
    label: "Video",
    media: { kinds: ["video"], aspectRatios: ["16:9"] },
  },

  // Threads
  {
    id: "threads.post",
    platform: "threads",
    archetype: "text",
    label: "Post",
    media: { kinds: ["image", "video"] },
    text: { max: 500 },
  },
  {
    id: "threads.thread",
    platform: "threads",
    archetype: "thread",
    label: "Thread",
    sequence: true,
    media: { kinds: ["image", "video"] },
    text: { max: 500 },
  },

  // Pinterest (heavy in the content calendar — pins + idea pins + boards)
  {
    id: "pinterest.pin",
    platform: "pinterest",
    archetype: "image",
    label: "Pin",
    surface: "feed",
    media: { kinds: ["image"], min: 1, max: 1, aspectRatios: ["2:3"] },
  },
  {
    id: "pinterest.idea_pin",
    platform: "pinterest",
    archetype: "carousel",
    label: "Idea Pin",
    media: {
      kinds: ["image", "video"],
      min: 1,
      max: 20,
      aspectRatios: ["9:16"],
    },
  },

  // Owned surfaces
  {
    id: "newsletter.broadcast",
    platform: "newsletter",
    archetype: "article",
    label: "Newsletter Issue",
    media: { kinds: ["image"] },
  },
  {
    id: "newsletter.blast",
    platform: "newsletter",
    archetype: "article",
    label: "Email Blast",
    countsTowardCadence: false,
    media: { kinds: ["image"] },
  },
  {
    id: "blog.post",
    platform: "blog",
    archetype: "article",
    label: "Blog Post",
    media: { kinds: ["image"] },
  },
];

// ---- LOOKUP HELPERS ------------------------------------------------

const FORMAT_BY_ID = new Map(PLATFORM_FORMATS.map((f) => [f.id, f]));

export function getPlatformFormat(id: string): PlatformFormat | undefined {
  return FORMAT_BY_ID.get(id);
}

export function platformFormatsFor(
  platform: ChannelPlatform,
): PlatformFormat[] {
  return PLATFORM_FORMATS.filter((f) => f.platform === platform);
}

export function archetypeForFormat(id: string): FormatArchetype | undefined {
  return FORMAT_BY_ID.get(id)?.archetype;
}

/** Whether a concrete format belongs to the surface's recurring publishing
 * rhythm. Unknown/legacy formats count by default; only explicit one-offs opt
 * out, so historical newsletter rows are never silently discarded. */
export function formatCountsTowardCadence(
  id: string | null | undefined,
): boolean {
  return id ? FORMAT_BY_ID.get(id)?.countsTowardCadence !== false : true;
}

// ---- VALIDATION ----------------------------------------------------

export type SpotLike = {
  platform: string;
  format: string;
  archetype?: string;
};

/** Validate a TargetSpot / platform_post format triple against the registry. */
export function validateSpot(spot: SpotLike): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const def = FORMAT_BY_ID.get(spot.format);
  if (!def) {
    errors.push(`unknown format "${spot.format}"`);
    return { ok: false, errors };
  }
  if (def.platform !== spot.platform) {
    errors.push(
      `format "${spot.format}" is ${def.platform}, not ${spot.platform}`,
    );
  }
  if (spot.archetype && spot.archetype !== def.archetype) {
    errors.push(
      `format "${spot.format}" is archetype ${def.archetype}, not ${spot.archetype}`,
    );
  }
  return { ok: errors.length === 0, errors };
}

// ---- DETERMINISTIC CLASSIFICATION (no LLM) -------------------------
//
// The mechanic/format is almost always derivable from scraped fields — see the
// per-platform shapes in docs/brightdata-peer-scraping.md. The EDITORIAL
// template (gallery vs informational_deck vs property_roundup) is not; that's
// the AI step in ./classify. This function fills format + archetype + a
// confidence; template is left undefined for the AI pass.

export type FormatClassification = {
  format?: string;
  archetype?: FormatArchetype;
  confidence: number; // 0..1 for the format/archetype guess
};

const lower = (v: unknown) =>
  typeof v === "string" ? v.toLowerCase() : undefined;
const has = (v: unknown) => Array.isArray(v) && v.length > 0;

/**
 * Classify a scraped record's MECHANIC from its raw fields. Returns a partial
 * (template needs vision). `fields` is the platform-specific scraped object.
 */
export function classifyFormatFromFields(
  platform: string,
  fields: Record<string, unknown>,
): FormatClassification {
  const pick = (format: string, confidence = 0.9): FormatClassification => ({
    format,
    archetype: archetypeForFormat(format),
    confidence,
  });

  switch (platform) {
    case "instagram": {
      const ct = lower(fields.content_type);
      if (ct === "carousel") return pick("instagram.carousel");
      if (ct === "video") return pick("instagram.reel");
      if (ct === "image") return pick("instagram.image");
      if (has(fields.video_url)) return pick("instagram.reel", 0.7);
      return pick("instagram.image", 0.5);
    }
    case "tiktok":
      return has(fields.carousel_images)
        ? pick("tiktok.photo")
        : pick("tiktok.video");
    case "x": {
      // amplification (is_repost/quoted_post) is handled separately — still a
      // text/thread mechanically.
      if (fields.parent_post_details || lower(fields.is_thread) === "true")
        return pick("x.thread", 0.6);
      if (has(fields.videos)) return pick("x.video");
      return pick("x.tweet");
    }
    case "linkedin": {
      if (fields.document_page_count || fields.document_cover_image)
        return pick("linkedin.document");
      if (has(fields.videos)) return pick("linkedin.video");
      if (has(fields.images)) return pick("linkedin.image");
      return pick("linkedin.post", 0.7);
    }
    case "facebook": {
      // Zernio's analytics rows carry `mediaType` (image | video | carousel).
      const ct = lower(fields.content_type) || lower(fields.media_type);
      if (ct === "carousel") return pick("facebook.carousel");
      if (ct === "video") return pick("facebook.video");
      if (ct === "image") return pick("facebook.image");
      const attachments = fields.attachments;
      if (Array.isArray(attachments)) {
        const kinds = attachments.map((a) =>
          lower((a as Record<string, unknown>)?.type),
        );
        if (kinds.includes("video")) return pick("facebook.video");
        const photos = kinds.filter((kind) => kind === "photo").length;
        if (photos > 1) return pick("facebook.carousel");
        if (photos === 1) return pick("facebook.image");
      }
      return pick("facebook.post", 0.6);
    }
    default:
      return { confidence: 0 };
  }
}
