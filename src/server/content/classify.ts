import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import { env } from "@/env";

import {
  archetypeForFormat,
  classifyFormatFromFields,
  TEMPLATE_STARTERS,
  type FormatArchetype,
} from "./formats";

/**
 * classify() — THE shared front door between the Bright Data mappers (ingest of
 * scraped peer/own posts) and the slot generator. Two-stage:
 *
 *   1. MECHANIC (format + archetype) — deterministic from scraped fields, no LLM
 *      (classifyFormatFromFields). Cheap, runs on every record.
 *   2. TEMPLATE (editorial structure) — needs to *look* at the post, so it's an
 *      AI step over the cover image (vision) or caption (text). Returns a
 *      confidence; low confidence → needsReview, mirroring the
 *      discover→suggest→verify→human-confirms loop used for channel handles.
 *
 * The template step uses the AI SDK's structured output (generateText +
 * Output.object), matching the repo convention (twitter-monitor /
 * lead-extraction etc.) — no manual JSON parsing. The template vocabulary is
 * OPEN: TEMPLATE_STARTERS seed the prompt, but the model may return a new label.
 */

const CLASSIFY_MODEL = "claude-sonnet-4-6";
const REVIEW_THRESHOLD = 0.6;

export type Classification = {
  format?: string;
  archetype?: FormatArchetype;
  template?: string;
  confidence: number; // overall (min of the stages that ran)
  needsReview: boolean;
  source: "deterministic" | "vision" | "text" | "none";
};

export type ClassifyInput = {
  platform: string;
  fields?: Record<string, unknown>; // raw scraped record (mechanic comes from here)
  imageUrl?: string; // cover / first frame → vision template classification
  text?: string; // caption / body → text template classification
  // skip the LLM template step (e.g. high-volume ingest where mechanic is enough)
  skipTemplate?: boolean;
};

export async function classify(input: ClassifyInput): Promise<Classification> {
  const mech = input.fields
    ? classifyFormatFromFields(input.platform, input.fields)
    : { confidence: 0, format: undefined as string | undefined };

  const base: Classification = {
    format: mech.format,
    archetype: mech.format ? archetypeForFormat(mech.format) : undefined,
    confidence: mech.confidence,
    needsReview: mech.confidence < REVIEW_THRESHOLD,
    source: mech.format ? "deterministic" : "none",
  };

  if (input.skipTemplate || !env.ANTHROPIC_API_KEY) return base;
  if (!input.imageUrl && !input.text) return base;

  const tmpl = await classifyTemplate(input);
  if (!tmpl) return base;

  return {
    ...base,
    template: tmpl.template,
    confidence: Math.min(base.confidence || tmpl.confidence, tmpl.confidence),
    needsReview:
      base.needsReview || tmpl.confidence < REVIEW_THRESHOLD || tmpl.needsReview,
    source: input.imageUrl ? "vision" : "text",
  };
}

type TemplateResult = {
  template: string;
  confidence: number;
  needsReview: boolean;
};

const TEMPLATE_SCHEMA = z.object({
  template: z
    .string()
    .describe(
      "lowercase_snake editorial-structure label (one of the known ones, or a new one if none fit)",
    ),
  confidence: z.number().describe("0..1 confidence in the label"),
});

const TEMPLATE_PROMPT = `You classify the EDITORIAL STRUCTURE of a social post — what it *is* narratively, independent of platform mechanics.

Known structures (you MAY return a new lowercase_snake label if none fit):
${TEMPLATE_STARTERS.map((t) => `- ${t}`).join("\n")}

Guidance:
- "gallery" = related-but-loose photos (a trip, a property from several angles).
- "informational_deck" = a structured teaching sequence ("5 things you need to know"), often a shared visual design.
- "property_roundup" = multiple distinct properties/listings presented together.`;

/** AI template classification over the cover image (vision) or caption (text). */
export async function classifyTemplate(
  input: ClassifyInput,
): Promise<TemplateResult | null> {
  try {
    const { output } = await generateText({
      model: anthropic(CLASSIFY_MODEL),
      system: TEMPLATE_PROMPT,
      output: Output.object({ schema: TEMPLATE_SCHEMA }),
      messages: [
        {
          role: "user",
          content: input.imageUrl
            ? [
                {
                  type: "text" as const,
                  text: `Caption (context): ${input.text ?? "(none)"}`,
                },
                { type: "image" as const, image: new URL(input.imageUrl) },
              ]
            : [{ type: "text" as const, text: `Post text:\n${input.text}` }],
        },
      ],
    });

    return {
      template: output.template,
      confidence: output.confidence,
      needsReview: output.confidence < REVIEW_THRESHOLD,
    };
  } catch {
    return null;
  }
}
