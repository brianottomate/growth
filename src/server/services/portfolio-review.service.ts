import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";

import { catalogCardPreviewUrl } from "@/lib/catalog-studio";
import { brandStorySection, portfolioReviewPrompt } from "@/server/ai/prompts";
import { db } from "@/server/db";
import { adTable } from "@/server/db/schema";

import { catalogState } from "./catalog-studio.service";
import { renderCompositionUrl } from "./composition.service";
import { fetchPublicImage } from "./media.service";
import { numberedSheet } from "./starter-ad-generation.service";

// One look at a whole set of creative: every catalog card, or every ad in a
// campaign or the brand's draft set. It returns an overall read and a few
// surgical notes, and changes nothing itself. The chat applies the notes
// with the per-card tools, so every change stays one observable,
// reversible step the operator can see and undo.

const MODEL = "claude-sonnet-5";
/** Cards per sheet. The catalog and ads are portrait, 4:5. */
const PER_SHEET = 16;
const TILE = { width: 240, height: 300 };
/** A review reads at most this many cards. */
const MAX_CARDS = 64;

type Item = {
  ref: { homeId?: string; adId?: string };
  name: string;
  headline: string;
  detail: string;
  imageUrl: string;
};

/** A card's image: a recipe URL drawn here, or a stored file fetched. */
async function imageOf(userId: string, url: string) {
  return url.startsWith("/api/compositions/preview")
    ? renderCompositionUrl(userId, url)
    : (await fetchPublicImage(url)).body;
}

async function catalogItems(userId: string, brandId: string): Promise<Item[]> {
  const { homes, draft } = await catalogState(userId, brandId);
  const byId = new Map(homes.map((home) => [home.id, home]));
  return draft.cards.flatMap((card) => {
    const url = card.included ? catalogCardPreviewUrl(brandId, card) : null;
    if (!url) return [];
    return [
      {
        ref: { homeId: card.homeId },
        name: byId.get(card.homeId)?.name ?? card.homeId,
        headline: card.title,
        detail: card.subtitle,
        imageUrl: url,
      },
    ];
  });
}

async function adItems(
  brandId: string,
  campaignId: string | null,
): Promise<Item[]> {
  const ads = await db.query.adTable.findMany({
    where: and(
      eq(adTable.brandId, brandId),
      campaignId
        ? eq(adTable.campaignId, campaignId)
        : isNull(adTable.campaignId),
    ),
    orderBy: (ad, { asc }) => [asc(ad.createdAt)],
  });
  return ads.flatMap((ad) => {
    const content = ad.content;
    if (!("media" in content) || !content.media[0]?.url) return [];
    return [
      {
        ref: { adId: ad.id },
        name: ad.name,
        headline: content.headline,
        detail:
          `${content.media.length > 1 ? `carousel of ${content.media.length}` : "static"} · ${content.body}`.slice(
            0,
            300,
          ),
        imageUrl: content.media[0].url,
      },
    ];
  });
}

export async function reviewPortfolio(input: {
  userId: string;
  brandId: string;
  brandName: string;
  brandStory: string | null;
  surface: "catalog" | "ads";
  /** For ads: the campaign to review; omitted, the brand's draft set with no campaign. */
  campaignId?: string;
}) {
  const all =
    input.surface === "catalog"
      ? await catalogItems(input.userId, input.brandId)
      : await adItems(input.brandId, input.campaignId ?? null);
  if (all.length === 0)
    throw new Error(
      input.surface === "catalog"
        ? "This brand's catalog has no included cards to review."
        : "There are no ads with images to review here.",
    );
  // Four cards at a time; a card that fails to render is reported, not fatal.
  const items: Item[] = [];
  const bodies: Buffer[] = [];
  const unrendered: string[] = [];
  const candidates = all.slice(0, MAX_CARDS);
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = candidates.slice(i, i + 4);
    const drawn = await Promise.all(
      batch.map(async (item) => {
        try {
          const body = await imageOf(input.userId, item.imageUrl);
          await sharp(body).metadata();
          return body;
        } catch {
          return null;
        }
      }),
    );
    batch.forEach((item, index) => {
      const body = drawn[index];
      if (body) {
        items.push(item);
        bodies.push(body);
      } else unrendered.push(item.name);
    });
  }
  if (items.length === 0) throw new Error("None of these cards would render.");
  const sheets: Buffer[] = [];
  for (let offset = 0; offset < bodies.length; offset += PER_SHEET)
    sheets.push(
      await numberedSheet(bodies.slice(offset, offset + PER_SHEET), {
        firstLabel: offset + 1,
        tile: TILE,
      }),
    );

  const { system, prompt } = portfolioReviewPrompt({
    brandName: input.brandName,
    surface: input.surface,
    brandStory: brandStorySection({
      brandName: input.brandName,
      story: input.brandStory,
    }),
    items: items.map((item, index) => ({
      number: index + 1,
      name: item.name,
      headline: item.headline,
      detail: item.detail,
    })),
  });
  const { output } = await generateText({
    model: anthropic(MODEL),
    system,
    output: Output.object({
      schema: z.object({
        overall: z.string(),
        notes: z.array(
          z.object({ number: z.number().int(), note: z.string() }),
        ),
      }),
    }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...sheets.map((sheet) => ({
            type: "file" as const,
            data: sheet,
            mediaType: "image/jpeg" as const,
          })),
        ],
      },
    ],
  });

  return {
    surface: input.surface,
    reviewed: items.length,
    skipped: Math.max(0, all.length - MAX_CARDS),
    unrendered,
    overall: output.overall,
    notes: output.notes.flatMap((note) => {
      const item = items[note.number - 1];
      return item
        ? [
            {
              number: note.number,
              name: item.name,
              ...item.ref,
              note: note.note,
            },
          ]
        : [];
    }),
  };
}
