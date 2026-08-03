import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

// Vision ranking for property imagery. The crawl's candidate order is whatever
// the source page happened to emit, which routinely leads with a bathroom or a
// laundry room — the single biggest "this looks like garbage" factor on a
// generated homepage. Growth-native equivalent of the monolith's contact-sheet
// + thumbnailIndex pass, minus sharp: Sonnet sees the candidate URLs directly
// (the AI SDK's image parts accept URLs) and returns an ordering.
//
// Failure is non-fatal everywhere: an unranked list is the original order.

const MAX_CANDIDATES = 10;

const RankedImages = z.object({
  order: z
    .array(z.number().int())
    .describe(
      "Candidate numbers, best first. Every candidate appears exactly once. Numbers are 1-based, matching the labels in the prompt.",
    ),
  rejected: z
    .array(z.number().int())
    .describe(
      "Candidate numbers that must never be a lead image: bathrooms, laundry rooms, closets, dark or cramped shots, close-ups of objects, floor plans, logos, screenshots.",
    ),
});

const RANKING_SYSTEM = [
  "You are choosing which photo sells a vacation rental at a glance.",
  "",
  "Rank the numbered images best-first for use as the SINGLE lead photo on a",
  "property card or as a full-width hero background.",
  "",
  "STRONG lead photos, roughly in this order:",
  "- the exterior of the home, ideally with landscape or sky",
  "- a bright, wide living space (living room, great room, open kitchen-living)",
  "- a view from the property: water, mountains, forest, vineyard, skyline",
  "- a deck, patio, pool, or hot tub in daylight",
  "- a well-styled bedroom, if nothing above is available",
  "",
  "NEVER a lead photo (put these in `rejected`):",
  "- bathrooms, toilets, showers, vanities",
  "- laundry rooms, washers, dryers, utility spaces, closets, garages",
  "- close-ups of objects, appliances, signage, keys, coffee machines",
  "- dark, blurry, cramped, or hallway shots",
  "- floor plans, maps, logos, screenshots, collages, watermarked stock",
  "",
  "Judge on what the photo shows and how appealing it looks, not image size.",
  "Return every candidate number exactly once in `order`.",
].join("\n");

/**
 * Rank image URLs best-first for lead/hero use. Returns a new array; on any
 * failure returns the input unchanged (never throws). Rejected candidates are
 * moved to the back rather than dropped, so a unit with only weak photos still
 * renders a card.
 */
export async function rankImagesForLead(urls: string[]): Promise<string[]> {
  const candidates = urls.slice(0, MAX_CANDIDATES);
  if (candidates.length < 2) return urls;

  try {
    const { output } = await generateText({
      model: anthropic("claude-sonnet-5"),
      output: Output.object({ schema: RankedImages }),
      temperature: 0,
      system: RANKING_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text" as const,
              text: `Rank these ${candidates.length} candidate photos.`,
            },
            ...candidates.flatMap((url, index) => [
              { type: "text" as const, text: `Candidate ${index + 1}:` },
              { type: "image" as const, image: new URL(url) },
            ]),
          ],
        },
      ],
    });

    const rejected = new Set(output.rejected.map((n) => n - 1));
    const seen = new Set<number>();
    const ordered: string[] = [];

    for (const n of output.order) {
      const index = n - 1;
      const url = candidates[index];
      if (url && !seen.has(index) && !rejected.has(index)) {
        seen.add(index);
        ordered.push(url);
      }
    }
    // Rejected and unmentioned candidates keep their original relative order.
    for (const [index, url] of candidates.entries()) {
      if (!seen.has(index)) ordered.push(url);
    }
    // Anything beyond the vision cap stays at the back untouched.
    return [...ordered, ...urls.slice(MAX_CANDIDATES)];
  } catch {
    return urls;
  }
}

/**
 * Rank each unit's candidates concurrently. Units are independent, so one
 * unit's failure costs only its own ordering.
 */
export async function rankUnitImages<T extends { imageUrls: string[] }>(
  units: T[],
): Promise<T[]> {
  return Promise.all(
    units.map(async (unit) => ({
      ...unit,
      imageUrls: await rankImagesForLead(unit.imageUrls),
    })),
  );
}
