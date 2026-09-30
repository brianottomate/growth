import "server-only";
import {
  brandStorySection,
  META_COLLECTION_CAPTION,
  META_DESCRIPTION,
  META_HEADLINE,
  META_HOME_CAPTION,
} from "@/server/ai/prompts";
import { contactSheet } from "./starter-ad-generation.service";

import { anthropic } from "@ai-sdk/anthropic";
import { Output, generateText } from "ai";
import { z } from "zod";

import {
  amenityHook,
  amenitySource,
  rankAmenities,
  type RankedAmenity,
} from "@/lib/home-amenities";

// The words an ad set runs on, written from what the client's own site says.
//
// Two surfaces, two rules. The PRIMARY TEXT is the caption above the image,
// and it follows the team's post template: a hook line with one emoji, emoji
// bullets for the amenities, the facts, a short paragraph, a closing line. The
// feed shows the first line or two before "more", so the hook carries the
// ad on its own. The CARD is drawn into the image by the renderer, which
// cannot draw most emoji and has no room for a paragraph, so it gets a short
// line and nothing else.
//
// Everything is grounded in the listing: its amenity labels and its own
// description. The model is told to use nothing else, because an invented
// hot tub is a refund.

const MODEL = "claude-sonnet-5";

/** Under the 1,200 the ad editor accepts, with room for an operator's edit. */
const BODY_MAX = 900;

/** Meta cuts the description off early on most placements. */
const DESCRIPTION_MAX = 60;

const HomeCopySchema = z.object({
  /** The caption, in the per-home template. */
  primaryText: z.string().min(20).max(BODY_MAX),
  /** Meta's headline, under the image. */
  headline: z.string().max(60),
  /** Meta's grey line under the headline. */
  description: z.string().max(DESCRIPTION_MAX),
  /** The words drawn onto the card. No emoji: the renderer cannot draw them. */
  cardTitle: z.string().max(52),
});

const SetCopySchema = z.object({
  /** One per home, in the order given. */
  homes: z.array(HomeCopySchema),
  /** The caption for the carousel of every home in the set. */
  portfolioPrimaryText: z.string().min(20).max(BODY_MAX),
  portfolioHeadline: z.string().max(60),
  portfolioDescription: z.string().max(DESCRIPTION_MAX),
  /** The caption for the catalog ad, where Meta ranks the same homes. */
  catalogPrimaryText: z.string().min(20).max(BODY_MAX),
  catalogHeadline: z.string().max(60),
  catalogDescription: z.string().max(DESCRIPTION_MAX),
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
  /** The hero the card is drawn on, for the call that writes onto it. */
  heroUrl?: string | null;
};

const facts = (home: CopyHome) =>
  [
    home.bedrooms ? `${home.bedrooms} bedrooms` : null,
    home.bathrooms ? `${home.bathrooms} baths` : null,
    home.guests ? `sleeps ${home.guests}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/** The template's facts bullet: "🛏️ 4 bedrooms · 3.5 bathrooms · Sleeps 12". */
const factsBullet = (home: CopyHome) => {
  const line = [
    home.bedrooms ? `${home.bedrooms} bedrooms` : null,
    home.bathrooms ? `${home.bathrooms} bathrooms` : null,
    home.guests ? `Sleeps ${home.guests}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return line ? `🛏️ ${line}` : null;
};

/** The home's facts as a description: "5 bedrooms · 4 baths · sleeps 12". */
export const homeFactsDescription = (home: CopyHome) =>
  (facts(home) || home.place).slice(0, DESCRIPTION_MAX);

const town = (place: string) => place.split(",")[0]?.trim() ?? "";

/** Amenities most of the set shares, best first: what the portfolio can promise. */
function sharedAmenities(homes: CopyHome[]) {
  const counts = new Map<string, { row: RankedAmenity; n: number }>();
  for (const home of homes) {
    for (const row of rankAmenities(
      amenitySource(home.amenities, home.description),
    )) {
      const seen = counts.get(row.key);
      counts.set(row.key, { row, n: (seen?.n ?? 0) + 1 });
    }
  }
  return [...counts.values()]
    .filter(({ n }) => n * 2 >= homes.length)
    .map(({ row }) => row);
}

/**
 * Copy from the facts alone: the deterministic first pass, and the model's
 * fallback. Already in the post template's shape, with bullets from the real
 * amenity labels, so a shell reads like the finished caption and the AI pass
 * only has to write the hook and the paragraph.
 */
export function deterministicSetCopy(
  homes: CopyHome[],
  brandName: string,
): AdSetCopy {
  const where = homes[0]?.place ?? "";
  const place = town(where);
  const shared = sharedAmenities(homes).slice(0, 4);
  const sleepsUpTo = Math.max(0, ...homes.map((home) => home.guests ?? 0));
  const setText = [
    `Your next ${place ? `${place} ` : ""}escape starts here 🏡`,
    place ? `🏡 Homes in ${place}` : null,
    ...shared.map((row) => row.bullet),
    sleepsUpTo >= 8 ? `👨‍👩‍👧‍👦 Homes that sleep up to ${sleepsUpTo}` : null,
    "",
    `Book direct with ${brandName}.`,
  ]
    .filter((line) => line !== null)
    .join("\n");
  const setHeadline = (
    place ? `Your ${place} escape starts here` : brandName
  ).slice(0, 60);
  const setDescription = (
    homes.length === 1
      ? homeFactsDescription(homes[0]!)
      : sleepsUpTo >= 8
        ? `${homes.length} homes · sleep up to ${sleepsUpTo}`
        : `Book direct with ${brandName}`
  ).slice(0, DESCRIPTION_MAX);
  return {
    homes: homes.map((home) => {
      const labels = amenitySource(home.amenities, home.description);
      const hook = amenityHook(labels);
      return {
        primaryText: [
          `Your ${town(home.place) ? `${town(home.place)} ` : ""}getaway starts here 🏡`,
          ...rankAmenities(labels)
            .slice(0, 5)
            .map((row) => row.bullet),
          factsBullet(home),
          "",
          `Book ${home.name} direct with ${brandName}.`,
        ]
          .filter((line) => line !== null)
          .join("\n")
          .slice(0, BODY_MAX),
        headline: home.name.slice(0, 60),
        description: homeFactsDescription(home),
        cardTitle: (hook?.hook ?? home.name).slice(0, 52),
      };
    }),
    portfolioPrimaryText: setText,
    portfolioHeadline: setHeadline,
    portfolioDescription: setDescription,
    catalogPrimaryText: setText,
    catalogHeadline: setHeadline,
    catalogDescription: setDescription,
  };
}

/**
 * Copy for a whole set in one pass, so the homes read as one campaign and the
 * portfolio caption can refer to what the individual ones already said.
 *
 * Falls back to copy built from the same facts rather than failing the build:
 * a set with plain words is worth more than no set.
 */
export async function writeAdSetCopy(input: {
  brandName: string;
  /** The brand story every creative prompt for the brand reads. */
  brandStory: string | null;
  homes: CopyHome[];
}): Promise<AdSetCopy> {
  if (input.homes.length === 0) {
    throw new Error("An ad set needs at least one home");
  }
  const places = [
    ...new Set(input.homes.map((home) => home.place).filter(Boolean)),
  ];
  const where = places.length === 1 ? places[0]! : places.join(", ");
  // The heroes on one numbered sheet, in the homes' order, so the card title
  // is written for the photo it will be drawn on. One sheet holds sixteen.
  const heroes =
    input.homes.length <= 16 && input.homes.every((home) => home.heroUrl)
      ? await contactSheet({
          id: "set",
          name: input.brandName,
          url: "",
          photos: input.homes.map((home) => ({ url: home.heroUrl! })),
        }).catch(() => null)
      : null;

  try {
    const { output } = await generateText({
      model: anthropic(MODEL),
      output: Output.object({ schema: SetCopySchema }),
      system: [
        "You write paid-social ad copy for a vacation-rental manager.",
        "Use ONLY the facts given for each home. Never invent an amenity, a rating, a distance, a price or availability. If a home has no hot tub listed, it has no hot tub. Never call an amenity private unless the facts say so.",
        "",
        "Every home's primaryText:",
        META_HOME_CAPTION,
        "",
        "The portfolio and catalog captions:",
        META_COLLECTION_CAPTION,
        "A portfolio or catalog bullet may only claim what most of the homes have.",
        "",
        META_HEADLINE,
        META_DESCRIPTION,
        "cardTitle is drawn INTO the image by a renderer that cannot draw emoji and has little room: at most six words, no emoji, no punctuation at the end. Lead on the home's best amenity, not its name.",
        "",
        "Homes may share a hook shape, the stay sentence and the closing line; only the bullets must be each home's own.",
        "No exclamation marks, no all-caps, no hashtags, no invented superlatives.",
        brandStorySection({
          brandName: input.brandName,
          story: input.brandStory,
        }),
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            ...(heroes
              ? [
                  {
                    type: "file" as const,
                    data: heroes.image,
                    mediaType: "image/jpeg" as const,
                  },
                  {
                    type: "text" as const,
                    text: "Each home's hero photo is on the numbered sheet, in the order below. The cardTitle is drawn onto that photo, so it must be true of what the photo shows.",
                  },
                ]
              : []),
            {
              type: "text" as const,
              text: [
                `Property manager: ${input.brandName}`,
                where ? `Where: ${where}` : null,
                "",
                "Homes, in order. Return one copy object per home in this same order:",
                ...input.homes.map((home, index) =>
                  [
                    `${index + 1}. ${home.name}`,
                    `   where: ${home.place || "unstated"}`,
                    `   facts: ${facts(home) || "unstated"}`,
                    home.nightlyFrom
                      ? `   from: $${home.nightlyFrom} a night`
                      : null,
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
            },
          ],
        },
      ],
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
