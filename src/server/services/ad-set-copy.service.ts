import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { Output, generateText } from "ai";
import { z } from "zod";

// The words an ad set runs on, written from what the client's own site says.
//
// Two surfaces, two rules. The PRIMARY TEXT is the caption above the image:
// the feed cuts it off after about 125 characters, behind a "more", so it is
// one or two short sentences that hook and name the place, not a feature dump.
// The CARD is drawn into the image by the renderer, which cannot draw most
// emoji and has no room for a paragraph, so it gets a short line and nothing
// else. The features live in the composition, not the caption.
//
// Everything is grounded in the listing: its amenity labels and its own
// description. The model is told to use nothing else, because an invented
// hot tub is a refund.

const MODEL = "claude-sonnet-5";

/** The feed truncates primary text past this, so the caption is written to it. */
const BODY_MAX = 125;

const HomeCopySchema = z.object({
  /** The caption: one or two short sentences, under what the feed truncates. */
  primaryText: z.string().min(20).max(BODY_MAX),
  /** Meta's headline, under the image. */
  headline: z.string().max(60),
  /** The words drawn onto the card. No emoji: the renderer cannot draw them. */
  cardTitle: z.string().max(52),
});

const SetCopySchema = z.object({
  /** One per home, in the order given. */
  homes: z.array(HomeCopySchema),
  /** The caption for the carousel of every home in the set. */
  portfolioPrimaryText: z.string().min(20).max(BODY_MAX),
  portfolioHeadline: z.string().max(60),
  /** The caption for the catalog ad, where Meta ranks the same homes. */
  catalogPrimaryText: z.string().min(20).max(BODY_MAX),
  catalogHeadline: z.string().max(60),
});

export type AdSetCopy = z.infer<typeof SetCopySchema>;
export type HomeCopy = z.infer<typeof HomeCopySchema>;

export type CopyHome = {
  name: string;
  place: string;
  bedrooms: number | null;
  bathrooms: number | null;
  guests: number | null;
  nightlyFrom: number | null;
  amenities: string[];
  description: string | null;
};

const facts = (home: CopyHome) =>
  [
    home.bedrooms ? `${home.bedrooms} bedrooms` : null,
    home.bathrooms ? `${home.bathrooms} baths` : null,
    home.guests ? `sleeps ${home.guests}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Copy from the facts alone: the deterministic first pass, and the model's
 * fallback. Home name as the headline and the on-card title, the body from
 * the facts and amenities. No persuasion; that is the AI copy pass's job.
 */
export function deterministicSetCopy(
  homes: CopyHome[],
  brandName: string,
): AdSetCopy {
  const where = homes[0]?.place ?? "";
  return {
    homes: homes.map((home) => ({
      // A shell's body is one factual line, under Meta's limit on purpose: it
      // says what the home is and gets out of the way, so the copy pass has
      // room to write the pitch. The old fact-dump overflowed and read broken.
      primaryText:
        [facts(home), home.place].filter(Boolean).join(" · ") || home.name,
      headline: home.name.slice(0, 60),
      cardTitle: home.name.slice(0, 52),
    })),
    portfolioPrimaryText: `${homes.length} homes${where ? ` in ${where}` : ""}, booked direct with ${brandName}.`,
    portfolioHeadline: where
      ? `Stay in ${where}`.slice(0, 60)
      : brandName.slice(0, 60),
    catalogPrimaryText: `Find your ${where || "next"} stay with ${brandName}.`,
    catalogHeadline: where
      ? `Homes in ${where}`.slice(0, 60)
      : brandName.slice(0, 60),
  };
}

/**
 * Copy for a whole set in one pass, so the homes do not repeat each other and
 * the portfolio caption can refer to what the individual ones already said.
 *
 * Falls back to copy built from the same facts rather than failing the build:
 * a set with plain words is worth more than no set.
 */
export async function writeAdSetCopy(input: {
  brandName: string;
  homes: CopyHome[];
}): Promise<AdSetCopy> {
  if (input.homes.length === 0) {
    throw new Error("An ad set needs at least one home");
  }
  const places = [
    ...new Set(input.homes.map((home) => home.place).filter(Boolean)),
  ];
  const where = places.length === 1 ? places[0]! : places.join(", ");

  try {
    const { output } = await generateText({
      model: anthropic(MODEL),
      output: Output.object({ schema: SetCopySchema }),
      system: [
        "You write paid-social ad copy for a vacation-rental manager.",
        "Use ONLY the facts given for each home. Never invent an amenity, a rating, a distance, a price or availability. If a home has no hot tub listed, it has no hot tub.",
        "",
        `primaryText is the caption above the image, and the feed cuts it off after about ${BODY_MAX} characters. Write ONE or TWO short sentences, at most about 110 characters in total, that name the place and give the single best reason to stay. No bullet lists, no line breaks, no feature dumps: the image already carries the facts. At most one emoji, and only if it earns its place.`,
        "",
        "headline is the short line under the image. No emoji.",
        "cardTitle is drawn INTO the image by a renderer that cannot draw emoji and has little room: at most six words, no emoji, no punctuation at the end.",
        "",
        "Vary the openings across homes. Do not start every home the same way.",
        "No exclamation marks, no all-caps, no hashtags, no invented superlatives.",
      ].join("\n"),
      prompt: [
        `Property manager: ${input.brandName}`,
        where ? `Where: ${where}` : null,
        "",
        "Homes, in order. Return one copy object per home in this same order:",
        ...input.homes.map((home, index) =>
          [
            `${index + 1}. ${home.name}`,
            `   where: ${home.place || "unstated"}`,
            `   facts: ${facts(home) || "unstated"}`,
            home.nightlyFrom ? `   from: $${home.nightlyFrom} a night` : null,
            `   amenities: ${home.amenities.length ? home.amenities.join(", ") : "none listed"}`,
            home.description
              ? `   their description: ${home.description.slice(0, 700)}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
        "",
        "Then write the portfolio caption, for a carousel of all of these homes in order, and the catalog caption, for an ad where the platform picks which of these homes each viewer sees. Both should read as the manager's whole offer rather than one home.",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    });
    if (output?.homes.length !== input.homes.length) {
      return deterministicSetCopy(input.homes, input.brandName);
    }
    return output;
  } catch (error) {
    console.error("ad set copy failed", error);
    return deterministicSetCopy(input.homes, input.brandName);
  }
}
