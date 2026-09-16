import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import { imageMediaType } from "./media-analysis.service";

// Pick the lead photo for a home's ads with a vision pass. A listing's gallery
// often opens on an entrance sign, a floor plan, or a dark shot; the first
// photo is not the best photo. We look at the first few and choose the one an
// ad should lead with, and only the first few: the hero is near the front of a
// well-ordered gallery, and reading forty-three photos to rank them is spend
// the choice does not need.

const HERO_LOOKAHEAD = 5;
const HERO_MODEL = "claude-sonnet-5";

const heroSchema = z.object({
  index: z
    .number()
    .int()
    .describe("0-based index of the best lead photo among those shown."),
  reason: z.string().describe("One short clause on why, for the log."),
});

/**
 * The best of the first few photos to lead a vacation-rental ad, or the first
 * photo when the model is unreachable. Prefers a striking exterior or a bright,
 * inviting interior; avoids signage, logos, floor plans, maps, screenshots and
 * dark or blurry shots.
 */
export async function pickHeroPhoto(
  photos: string[],
): Promise<{ url: string; reason: string | null }> {
  const candidates = photos.filter(Boolean).slice(0, HERO_LOOKAHEAD);
  if (candidates.length === 0) return { url: "", reason: null };
  if (candidates.length === 1) return { url: candidates[0]!, reason: null };

  try {
    const { output } = await generateText({
      model: anthropic(HERO_MODEL),
      output: Output.object({ name: "HeroPick", schema: heroSchema }),
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "These are the first photos of a vacation-rental listing, in order.",
                "Choose the single best one to LEAD a paid social ad for the home.",
                "Prefer a striking exterior or a bright, inviting interior that reads instantly as a place to stay.",
                "Avoid: entrance signs and logos, floor plans and maps, screenshots, collages, and dark, cluttered or blurry shots.",
                "Return the 0-based index of the best photo.",
              ].join(" "),
            },
            ...candidates.map((url) => ({
              type: "file" as const,
              mediaType: imageMediaType(url),
              data: new URL(url),
            })),
          ],
        },
      ],
    });
    const index = Math.max(0, Math.min(output.index, candidates.length - 1));
    return { url: candidates[index]!, reason: output.reason };
  } catch (error) {
    console.error("hero pick failed", error);
    return { url: candidates[0]!, reason: null };
  }
}
