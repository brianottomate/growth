import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import type { ChannelPlatform } from "@/server/db/channel-schema";

import {
  archetypeForFormat,
  FORMAT_ARCHETYPES,
  getPlatformFormat,
  isArchetype,
  platformFormatsFor,
  TEMPLATE_STARTERS,
  type FormatArchetype,
} from "./formats";

/**
 * classify() — THE shared front door for typing a post (scraped peer, Zernio
 * owned, or a generated slot). **AI-first**: one `generateText` + `Output.object`
 * call reads whatever signal we have — the raw provider payload, the caption,
 * and the cover image (vision) — and returns the full format triple. We do NOT
 * lean on per-source field-matching or URL regexes; the model infers the
 * concrete format + mechanic + editorial structure from the post itself.
 *
 *   format    = concrete platform product ("instagram.reel") — validated
 *               against the registry; dropped if the model invents one.
 *   archetype = publish mechanic (image | carousel | video_short | story | …)
 *   template  = editorial structure (OPEN — starters seed the prompt)
 */

const CLASSIFY_MODEL = "claude-sonnet-5";
const REVIEW_THRESHOLD = 0.6;
const MAX_FIELDS_CHARS = 4000;

export type Classification = {
  format?: string;
  archetype?: FormatArchetype;
  template?: string;
  confidence: number;
  needsReview: boolean;
  source: "ai-vision" | "ai-text" | "none";
};

export type ClassifyInput = {
  platform: string;
  fields?: Record<string, unknown>; // raw provider record (any shape)
  imageUrl?: string; // cover / first frame → vision classification
  text?: string; // caption / body
};

const SCHEMA = z.object({
  format: z
    .string()
    .describe(
      'concrete platform format id from the allowed list (e.g. "instagram.reel"); "" if none fit',
    ),
  archetype: z
    .enum(FORMAT_ARCHETYPES)
    .describe("the publish mechanic — pick the closest"),
  template: z
    .string()
    .describe(
      "lowercase_snake editorial-structure label (a known one, or a new one if none fit)",
    ),
  confidence: z.number().describe("0..1 confidence in the format/archetype"),
});

function buildSystem(platform: string): string {
  const formats = platformFormatsFor(platform as ChannelPlatform);
  const formatList = formats.length
    ? formats.map((f) => `- ${f.id} — ${f.label} (${f.archetype})`).join("\n")
    : '(no registry formats for this platform — leave format "" and just pick the archetype)';
  return `You classify a single social post along THREE axes, independent of the platform's own labels:

1. FORMAT — the concrete platform product. Allowed values for ${platform}:
${formatList}

2. ARCHETYPE — the publish mechanic: ${FORMAT_ARCHETYPES.join(" | ")}.
   (reel/short/TikTok = video_short; IG carousel / LI document / TikTok photo = carousel; ephemeral 24h = story.)

3. TEMPLATE — the editorial structure (narrative shape, not mechanic). Known starters (you MAY return a new lowercase_snake label):
${TEMPLATE_STARTERS.map((t) => `- ${t}`).join("\n")}

Use the provided raw fields, caption, and image to decide. Prefer a specific FORMAT from the list; only return "" for format if genuinely none apply. Be decisive but set a lower confidence when the signal is weak.`;
}

/** AI classification over the raw payload + caption + (optional) cover image. */
async function runAi(
  input: ClassifyInput,
  withImage: boolean,
): Promise<Classification | null> {
  const fieldsText = input.fields
    ? JSON.stringify(input.fields).slice(0, MAX_FIELDS_CHARS)
    : "(none)";
  const textBlock = `Platform: ${input.platform}
Raw provider fields (truncated): ${fieldsText}
Caption / text: ${input.text ?? "(none)"}`;

  const { output } = await generateText({
    model: anthropic(CLASSIFY_MODEL),
    system: buildSystem(input.platform),
    output: Output.object({ schema: SCHEMA }),
    messages: [
      {
        role: "user",
        content:
          withImage && input.imageUrl
            ? [
                { type: "text" as const, text: textBlock },
                { type: "image" as const, image: new URL(input.imageUrl) },
              ]
            : [{ type: "text" as const, text: textBlock }],
      },
    ],
  });

  // Validate the format against the registry — drop a hallucinated id but keep
  // the archetype (which we trust as the mechanic).
  const def = output.format ? getPlatformFormat(output.format) : undefined;
  const format = def?.platform === input.platform ? output.format : undefined;
  const archetype = format
    ? archetypeForFormat(format)
    : isArchetype(output.archetype)
      ? output.archetype
      : undefined;

  return {
    format,
    archetype,
    template: output.template?.trim() || undefined,
    confidence: output.confidence,
    needsReview: output.confidence < REVIEW_THRESHOLD,
    source: withImage && input.imageUrl ? "ai-vision" : "ai-text",
  };
}

export async function classify(input: ClassifyInput): Promise<Classification> {
  // Try vision first when we have a cover; an expired/blocked image URL makes
  // the API fetch fail, so fall back to text-only, then to nothing.
  try {
    const r = await runAi(input, !!input.imageUrl);
    if (r) return r;
  } catch {
    if (input.imageUrl) {
      try {
        const r = await runAi(input, false);
        if (r) return r;
      } catch {
        /* fall through */
      }
    }
  }
  return { confidence: 0, needsReview: true, source: "none" };
}
