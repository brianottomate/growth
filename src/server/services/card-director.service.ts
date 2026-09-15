import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";

import {
  getCompositionFormat,
  getCompositionTemplate,
  type FreezeCompositionInput,
} from "@/lib/compositions";
import {
  GEMINI_IMAGE_MODEL,
  generateGeminiImage,
  isGeminiImageConfigured,
} from "@/server/clients/gemini-image.client";
import { db } from "@/server/db";
import { mediaAssetTable } from "@/server/db/schema";
import {
  catalogHeadline,
  findDirectedCard,
  findFrozenComposition,
  findJudgedComposition,
  freezeComposition,
  recordCardDirection,
  type CardDirectionRecord,
} from "@/server/services/composition.service";
import { importImageBuffer } from "@/server/services/media.service";

// ---- THE ART DIRECTOR -------------------------------------------------------
//
// A rendered card is a photo the renderer never looked at, with copy it never
// read, cropped to a ratio the photographer never shot for. Geometry gets it
// close; what it cannot know is whether the crop cut the house in half, the
// name broke into a bad third line, or the photo wanted a blue dark rather
// than a black one. A model that can see the card can, and answers in a
// small JSON the renderer already understands. Every field is bounded and
// every change is one the renderer can apply deterministically, so the pass
// can only nudge: it never writes new copy, only shortens what it was given.

const MODEL = "claude-sonnet-5";

export const CardDirectionSchema = z.object({
  verdict: z.enum(["keep", "adjust"]),
  /** The point of the ORIGINAL photo that must stay in frame, in percent. */
  focal: z
    .object({
      x: z.number().int().min(0).max(100),
      y: z.number().int().min(0).max(100),
    })
    .nullable(),
  /** A shorter headline, or null to keep it. */
  title: z.string().max(120).nullable(),
  /** A shorter facts line, an empty string to drop it, or null to keep it. */
  subtitle: z.string().max(220).nullable(),
  /** A hue for the darkening, or null for black. */
  scrim: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  /**
   * Whether no crop of this photo can show the subject, and which way the
   * photo would need more canvas to do so.
   */
  extend: z.enum(["none", "vertical", "horizontal"]),
  note: z.string().max(400),
});

export type CardDirection = z.infer<typeof CardDirectionSchema>;

export const KEEP: CardDirection = {
  verdict: "keep",
  focal: null,
  title: null,
  subtitle: null,
  scrim: null,
  extend: "none",
  note: "",
};

/**
 * The spec after the director's changes, and what changed in words.
 *
 * Copy is only ever shortened: a longer or empty headline is ignored, a
 * longer facts line likewise, and an empty facts line drops it. The focal
 * point replaces the coarse position. The tint is stored as given; the
 * renderer pulls it down to legibility when it draws.
 */
export function applyDirection(
  spec: FreezeCompositionInput,
  direction: CardDirection,
): { spec: FreezeCompositionInput; changes: string[] } {
  if (direction.verdict === "keep") return { spec, changes: [] };
  const next: FreezeCompositionInput = { ...spec };
  const changes: string[] = [];

  const title = direction.title?.trim();
  if (title && title.length < spec.title.length) {
    next.title = title;
    changes.push(`shortened the headline to “${title}”`);
  }

  if (direction.subtitle !== null) {
    const subtitle = direction.subtitle.trim();
    if (subtitle.length === 0 && spec.subtitle) {
      delete next.subtitle;
      changes.push("dropped the facts line");
    } else if (
      subtitle.length > 0 &&
      subtitle.length < (spec.subtitle ?? "").length
    ) {
      next.subtitle = subtitle;
      changes.push(`shortened the facts line to “${subtitle}”`);
    }
  }

  if (
    direction.focal &&
    (spec.focal?.x !== direction.focal.x || spec.focal?.y !== direction.focal.y)
  ) {
    next.focal = direction.focal;
    changes.push(
      `moved the crop to keep the home in frame (${direction.focal.x}% across, ${direction.focal.y}% down)`,
    );
  }

  if (
    direction.scrim &&
    direction.scrim.toLowerCase() !== spec.scrim?.toLowerCase()
  ) {
    next.scrim = direction.scrim.toLowerCase();
    changes.push(`tinted the darkening toward ${next.scrim}`);
  }

  return { spec: next, changes };
}

/** The image as the model should see it: small, flat, and in a JPEG. */
async function forTheModel(bytes: Buffer, width: number) {
  return sharp(bytes)
    .resize({ width, withoutEnlargement: true })
    .flatten({ background: "#000000" })
    .jpeg({ quality: 82 })
    .toBuffer();
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok)
    throw new Error(`Download failed (${response.status}) for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * An art director's read of one rendered card against the photo it was cut
 * from. Returns `null` when the model could not be asked, so the caller can
 * say so rather than pass a silent `keep` off as a judgement.
 */
export async function critiqueCard(input: {
  card: Buffer;
  source: Buffer;
  spec: FreezeCompositionInput;
  brandName: string;
  home: { name: string; facts: string };
}): Promise<CardDirection | null> {
  try {
    const format = getCompositionFormat(input.spec.formatId);
    const headline = catalogHeadline(input.spec);
    const sourceMeta = await sharp(input.source).metadata();
    const [card, source] = await Promise.all([
      forTheModel(input.card, 600),
      forTheModel(input.source, 800),
    ]);
    const { output } = await generateText({
      model: anthropic(MODEL),
      output: Output.object({ schema: CardDirectionSchema }),
      system: [
        "You are the art director for a property manager's paid-social ads. You are shown a rendered ad card and the original photo it was cropped from. Judge it as a card in a feed at thumb size: does the home read at a glance, is every word legible, does nothing feel cut off or crowded.",
        "You can only make these corrections, and only when the card needs them:",
        "- focal: if the crop cut off the subject (the house, the pool, the view the photo is about), give the point of the ORIGINAL photo that must stay in frame, as percentages across and down. Leave null if the crop is fine.",
        "- extend: 'vertical' or 'horizontal' only when NO crop of this photo at this ratio could show the subject whole, and the photo would need more sky/ground (vertical) or more width (horizontal). Otherwise 'none'.",
        "- title: a shorter headline, only if it wraps into three or more lines, leaves a single word alone on its last line (an orphan; you are told exactly how it breaks), or covers the subject. It must still name the home; cut a suffix or descriptor, never invent words. Leave null to keep it.",
        "- subtitle: a shorter facts line, or an empty string to drop it, only if it collides with the headline or is unreadable. Use only facts already on the card. Leave null to keep it.",
        "- scrim: the darkening at the top and foot of the card is black by default. If the photo is dominated by one hue there (blue sky, green forest, teal water, warm sand), give that hue as a hex so the darkening becomes a deep version of it. Leave null for black or for a mixed scene.",
        "Prefer 'keep'. Most cards are fine. When you adjust, say in the note what you saw and what you changed, in one or two plain sentences.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "The rendered card:" },
            { type: "image", image: card },
            {
              type: "text",
              text: `The original photo, ${sourceMeta.width ?? "?"}×${sourceMeta.height ?? "?"} pixels:`,
            },
            { type: "image", image: source },
            {
              type: "text",
              text: [
                `Brand: ${input.brandName}. Home: ${input.home.name}.`,
                `Card: ${format.label.toLowerCase()} ${format.width}×${format.height}. Layout: ${getCompositionTemplate(input.spec.templateId).description}`,
                headline.length > 1
                  ? `Headline on the card, set on ${headline.length} lines: ${headline.map((line) => `“${line}”`).join(" / ")}.`
                  : `Headline on the card, on one line: “${input.spec.title}”.`,
                input.spec.subtitle
                  ? `Facts line on the card: “${input.spec.subtitle}”.`
                  : "No facts line.",
                input.home.facts
                  ? `Facts known about the home: ${input.home.facts}.`
                  : null,
                "Judge the card and answer with the corrections it needs, if any.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        },
      ],
      temperature: 0,
    });
    return output;
  } catch (error) {
    console.error("card critique failed", input.home.name, error);
    return null;
  }
}

function aspectRatioOf(formatId: FreezeCompositionInput["formatId"]) {
  const { width, height } = getCompositionFormat(formatId);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

/**
 * The photo with more of its own scene painted in, at the card's ratio, so
 * the cover crop no longer has to choose what to lose. Generated once per
 * photo and ratio; a rerun finds the earlier one by lineage.
 */
export async function extendSource(input: {
  brandId: string;
  userId: string;
  source: { id: string; url: string };
  formatId: FreezeCompositionInput["formatId"];
  axis: "vertical" | "horizontal";
  home: string;
}) {
  const aspectRatio = aspectRatioOf(input.formatId);
  const existing = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.brandId, input.brandId),
      eq(mediaAssetTable.provider, "r2"),
      eq(mediaAssetTable.kind, "image"),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
      sql`${mediaAssetTable.metadata} ->> 'extendedFrom' = ${input.source.id}`,
      sql`${mediaAssetTable.metadata} ->> 'aspectRatio' = ${aspectRatio}`,
    ),
    columns: { id: true, url: true },
  });
  if (existing?.url)
    return { id: existing.id, url: existing.url, reused: true };

  const where =
    input.axis === "vertical"
      ? "above and below it: continue the sky upward and the ground, deck or foliage downward"
      : "to its left and right: continue the landscape, trees and sky sideways";
  const original = await sharp(await download(input.source.url)).metadata();
  const { bytes, contentType } = await generateGeminiImage({
    prompt: [
      `Outpaint this photograph into a ${aspectRatio} frame.`,
      `Keep the original photograph exactly as it is, complete and unchanged, and add more of the same scene ${where}.`,
      "Photoreal, the same lens, light and colour grade as the original. Do not add text, people, vehicles, furniture or new buildings.",
    ].join(" "),
    aspectRatio,
    // 1K lands near one megapixel, under the card; 2K clears it.
    imageSize: "2K",
    referenceImageUrls: [input.source.url],
  });
  const meta = await sharp(bytes).metadata();
  // The same guard the monolith's hero outpaint uses: the model sometimes
  // answers in another ratio, or with far fewer pixels than it was given.
  // Either would make the card worse than the crop it was meant to fix.
  const { width, height } = getCompositionFormat(input.formatId);
  const wanted = width / height;
  if (!meta.width || !meta.height || !original.width) {
    throw new Error("The extended photo could not be measured.");
  }
  if (Math.abs(meta.width / meta.height - wanted) > wanted * 0.03) {
    throw new Error(
      `The extended photo came back ${meta.width}×${meta.height}, not ${aspectRatio}.`,
    );
  }
  if (meta.width < original.width * 0.75) {
    throw new Error(
      `The extended photo is ${meta.width}px wide against a ${original.width}px original.`,
    );
  }
  const asset = await importImageBuffer({
    brandId: input.brandId,
    uploadedBy: input.userId,
    body: bytes,
    contentType,
    filename: `extended-${aspectRatio.replace(":", "x")}.png`,
    title: `${input.home} — photo extended to ${aspectRatio}`,
    width: meta.width,
    height: meta.height,
    metadata: {
      extendedFrom: input.source.id,
      aspectRatio,
      axis: input.axis,
      model: GEMINI_IMAGE_MODEL,
    },
  });
  if (!asset.url) throw new Error("The extended photo has no URL yet.");
  return { id: asset.id, url: asset.url, reused: false };
}

/**
 * Extend a photo to the canvas's ratio along whichever axis it falls short:
 * a landscape photo on a portrait canvas gets more sky and ground, a portrait
 * one on a square gets more width. Same lineage reuse as `extendSource`.
 */
export async function extendToCanvas(input: {
  brandId: string;
  userId: string;
  source: { id: string; url: string };
  formatId: FreezeCompositionInput["formatId"];
  home: string;
}) {
  if (!isGeminiImageConfigured) {
    throw new Error("Photo extension is not configured here (no Gemini key).");
  }
  const meta = await sharp(await download(input.source.url)).metadata();
  const canvas = getCompositionFormat(input.formatId);
  if (!meta.width || !meta.height) {
    throw new Error("The photo could not be measured.");
  }
  const axis: "vertical" | "horizontal" =
    meta.width / meta.height > canvas.width / canvas.height
      ? "vertical"
      : "horizontal";
  const extended = await extendSource({ ...input, axis });
  return { ...extended, axis };
}

type StoredComposition = {
  composition?: { direction?: CardDirectionRecord } & Record<string, unknown>;
};

function storedDirection(metadata: unknown) {
  return (metadata as StoredComposition | null)?.composition?.direction ?? null;
}

export type DirectedCard = {
  id: string;
  url: string;
  /** True when nothing was rendered or judged on this run. */
  reused: boolean;
  /** What the director changed, in words; empty when the card was kept. */
  changes: string[];
  note: string | null;
};

/**
 * A card rendered, judged, and re-rendered where the judgement asked for it.
 *
 * Idempotent by lineage: a card the director already judged carries its
 * verdict, and a card it already re-cut points back at the one it replaced,
 * so a rerun returns the earlier answer instead of asking again. The model's
 * read is not deterministic; the stored one is.
 */
export async function renderDirectedCard(input: {
  userId: string;
  spec: FreezeCompositionInput;
  source: { id: string; url: string };
  brandName: string;
  home: { name: string; facts: string };
}): Promise<DirectedCard> {
  // A judged card for this photo, with the brand drawn as it is now, is the
  // answer whatever this run's copy pass happened to write.
  const judged = await findJudgedComposition({
    userId: input.userId,
    spec: input.spec,
  });
  if (judged?.url) {
    const record = storedDirection(judged.metadata);
    return {
      id: judged.id,
      url: judged.url,
      reused: true,
      changes: record?.changes ?? [],
      note: record?.note || null,
    };
  }

  const found = await findFrozenComposition({
    userId: input.userId,
    spec: input.spec,
  });
  if (found?.url) {
    const kept = storedDirection(found.metadata);
    if (kept) {
      return {
        id: found.id,
        url: found.url,
        reused: true,
        changes: kept.changes,
        note: kept.note || null,
      };
    }
    const directed = await findDirectedCard(found.id);
    if (directed?.url) {
      const record = storedDirection(directed.metadata);
      return {
        id: directed.id,
        url: directed.url,
        reused: true,
        changes: record?.changes ?? [],
        note: record?.note ?? null,
      };
    }
  }

  const base = found?.url
    ? { id: found.id, url: found.url }
    : await freezeComposition({ userId: input.userId, spec: input.spec }).then(
        (asset) => {
          if (!asset.url) throw new Error("The rendered card has no URL yet.");
          return { id: asset.id, url: asset.url };
        },
      );

  // The card exists by now; a director that cannot be reached, or bytes that
  // cannot be fetched for it, leave the card as rendered rather than losing it.
  const direction = await Promise.all([
    download(base.url),
    download(input.source.url),
  ])
    .then(([card, source]) =>
      critiqueCard({
        card,
        source,
        spec: input.spec,
        brandName: input.brandName,
        home: input.home,
      }),
    )
    .catch((error: unknown) => {
      console.error("card critique skipped", input.home.name, error);
      return null;
    });
  if (!direction) {
    return {
      ...base,
      reused: false,
      changes: [],
      note: "The art director could not be reached; the card is as rendered.",
    };
  }

  const applied = applyDirection(input.spec, direction);
  let spec = applied.spec;
  const changes = [...applied.changes];
  if (direction.verdict === "adjust" && direction.extend !== "none") {
    if (isGeminiImageConfigured) {
      try {
        const extended = await extendSource({
          brandId: input.spec.brandId,
          userId: input.userId,
          source: input.source,
          formatId: input.spec.formatId,
          axis: direction.extend,
          home: input.home.name,
        });
        spec = { ...spec, sourceMediaAssetId: extended.id };
        // The focal point was given on the original photo; on the extended
        // one the original sits centred, so the centre is the honest choice.
        delete spec.focal;
        changes.push(
          `extended the photo ${direction.extend === "vertical" ? "above and below" : "to both sides"} so the whole home fits`,
        );
      } catch (error) {
        console.error("photo extension failed", input.home.name, error);
        changes.push(
          "wanted the photo extended, which failed, so the crop stands",
        );
      }
    } else {
      changes.push("wanted the photo extended, which is not configured here");
    }
  }

  const note = direction.note.trim();
  if (
    spec === input.spec ||
    JSON.stringify(spec) === JSON.stringify(input.spec)
  ) {
    await recordCardDirection(base.id, { verdict: "keep", note, changes });
    return { ...base, reused: false, changes, note: note || null };
  }

  const rendered = await freezeComposition({
    userId: input.userId,
    spec,
    direction: { verdict: "adjust", note, changes, directedFrom: base.id },
  });
  if (!rendered.url) throw new Error("The re-rendered card has no URL yet.");
  return {
    id: rendered.id,
    url: rendered.url,
    reused: false,
    changes,
    note: note || null,
  };
}
