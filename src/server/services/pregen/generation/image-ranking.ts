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
// This pass makes two different judgements and they have different
// consequences. "Weak lead photo" (a bathroom, a dark hallway) is a RANKING
// call: the photo is real, it just should not go first, so it moves to the
// back and still renders when a unit has nothing better. "Not a photograph of
// a place at all" (a logo, a badge, a map, a screenshot) is a REJECTION: no
// ordering saves it, so it leaves the list entirely.
//
// The rejection half is the port of the monolith's reject-junk-images.ts. That
// exists because both defences upstream of it are name-shaped and byte-shaped:
// JUNK_IMAGE_PATTERN in units.ts catches third-party furniture that carries a
// giveaway filename, and a byte floor catches placeholders. Neither can catch
// an operator's OWN wordmark, because nobody names their logo "logo". Live
// case on mauiwestside.com: two of the five cards in a gallery we emailed were
// resort wordmarks sitting on the page as ordinary <img> elements under
// ordinary names, one of them clearing the monolith's 15,000-byte floor by 66
// bytes. Here it costs no extra model call, because this pass is already
// looking at every candidate.
//
// Failure is non-fatal everywhere: an unranked list is the original order, and
// nothing is rejected.

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
      "Candidate numbers that must never be a lead image but are still real photos of the property: bathrooms, laundry rooms, closets, dark or cramped shots, close-ups of objects.",
    ),
  notPhotographs: z
    .array(z.number().int())
    .describe(
      "Candidate numbers that are not photographs of a place at all: logos, wordmarks, badges, maps, floor plans, diagrams, screenshots, solid colours, text-heavy images, headshots.",
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
  "NEVER a lead photo, but still a real photo of the place (put these in",
  "`rejected` — they stay available when nothing better exists):",
  "- bathrooms, toilets, showers, vanities",
  "- laundry rooms, washers, dryers, utility spaces, closets, garages",
  "- close-ups of objects, appliances, keys, coffee machines",
  "- dark, blurry, cramped, or hallway shots",
  "",
  "NOT A PHOTOGRAPH OF A PLACE (put these in `notPhotographs` — they are",
  "removed from the site entirely):",
  "- a logo, wordmark, monogram or brand plate, INCLUDING the operator's own.",
  "  These are the main thing this list exists to catch and they often look",
  "  designed and attractive rather than obviously broken. Lettering on a plain",
  "  or textured background is a wordmark, not a photo.",
  "- a badge, award seal, partner mark, app-store button, payment-method row",
  "- a map, floor plan, diagram, chart or site plan",
  "- a screenshot of a website or an app",
  "- a solid colour, a gradient, a placeholder frame, an image that is mostly text",
  "- a person shot as a portrait or headshot rather than as part of a scene",
  "",
  "Keep anything you are unsure about: this removes things that are not",
  "photographs, not photographs that are unflattering. A dim, cluttered or badly",
  "cropped picture of a real room is a `rejected` at worst, never a",
  "`notPhotographs`.",
  "",
  "Judge on what the photo shows and how appealing it looks, not image size.",
  "Return every candidate number exactly once in `order`.",
].join("\n");

/**
 * Rank image URLs best-first for lead/hero use, and remove the ones that are
 * not photographs. Returns a new array; on any failure returns the input
 * unchanged (never throws). Weak-but-real photos move to the back rather than
 * out, so a unit with nothing but bathrooms still renders a card.
 */
export async function rankImagesForLead(urls: string[]): Promise<string[]> {
  const candidates = urls.slice(0, MAX_CANDIDATES);
  if (candidates.length < 2) return urls;

  try {
    // One retry, like every other structured call in this pipeline. Observed
    // live while porting: a single transient failure here silently reinstates
    // every logo and wordmark, because failing open means keeping everything.
    const ask = () =>
      generateText({
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
    const { output } = await ask().catch(ask);

    const rejected = new Set(output.rejected.map((n) => n - 1));
    // An index the model invented points at nothing, so a hallucinated verdict
    // cannot remove a real photo; it just falls out of the lookups below.
    const dropped = new Set(output.notPhotographs.map((n) => n - 1));
    const seen = new Set<number>();
    const ordered: string[] = [];

    for (const n of output.order) {
      const index = n - 1;
      const url = candidates[index];
      if (
        url &&
        !seen.has(index) &&
        !rejected.has(index) &&
        !dropped.has(index)
      ) {
        seen.add(index);
        ordered.push(url);
      }
    }
    // Rejected and unmentioned candidates keep their original relative order.
    // Dropped ones do not come back: that is the difference between the two.
    for (const [index, url] of candidates.entries()) {
      if (!seen.has(index) && !dropped.has(index)) ordered.push(url);
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
