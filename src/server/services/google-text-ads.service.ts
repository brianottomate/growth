import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { Output, generateText } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { brandStorySection } from "@/server/ai/prompts";
import { scrapeBasicContent } from "@/server/clients/firecrawl.client";
import { db } from "@/server/db";
import { adTable, audienceTable, brandTable } from "@/server/db/schema";
import type { AdCreativeContent } from "@/server/db/ads-schema";
import { createId } from "@/server/db/utils";
import { searchTerms } from "@/lib/search-terms";

import { resolveAdAuthoringScope } from "./ads-draft.service";
import { GOOGLE_RSA } from "./ads-write.service";

// Search text ads for a campaign, written on demand from what the landing
// page says and what the campaign's audiences search for. Each one lands as a
// text idea the operator reviews like any other; nothing is pushed.

const MODEL = "claude-sonnet-5";
const PAGE_CHARS = 12_000;

// Loose on purpose: the model overshooting a limit drops that line, not the
// whole answer. The pool is filtered to Google's limits below.
const DraftSchema = z.object({
  ads: z
    .array(
      z.object({
        angle: z.string().describe("Two to four words naming the angle"),
        headlines: z.array(z.string()).min(3).max(15),
        descriptions: z.array(z.string()).min(2).max(4),
      }),
    )
    .min(1)
    .max(3),
});

export async function writeGoogleTextAds(input: {
  organizationId: string;
  campaignId?: string;
  brandId?: string;
  landingUrl?: string;
  keywords?: string[];
  count?: number;
}) {
  const { campaign, brand } = await resolveAdAuthoringScope(input);
  const landingUrl = input.landingUrl ?? campaign?.landingUrl ?? brand.website;
  if (!landingUrl) {
    throw new Error("Supply a landing URL or set the brand website first");
  }
  const count = Math.min(Math.max(input.count ?? 2, 1), 3);
  const [story, page, audiences, ideas] = await Promise.all([
    db.query.brandTable.findFirst({
      where: eq(brandTable.id, brand.id),
      columns: { story: true },
    }),
    scrapeBasicContent({ url: landingUrl }),
    campaign
      ? db.query.audienceTable.findMany({
          where: eq(audienceTable.campaignId, campaign.id),
          columns: { name: true, keywords: true },
        })
      : Promise.resolve([]),
    db.query.adTable.findMany({
      where: campaign
        ? eq(adTable.campaignId, campaign.id)
        : and(eq(adTable.brandId, brand.id), isNull(adTable.campaignId)),
      columns: { type: true, content: true },
    }),
  ]);
  if (!page?.content) {
    throw new Error(`Could not read ${landingUrl}; check the landing URL`);
  }
  const terms = [
    ...(input.keywords ?? []),
    ...audiences.flatMap((audience) =>
      searchTerms(audience.keywords).map((term) => term.text),
    ),
  ];
  const messages = ideas
    .filter((idea) => idea.type === "creative")
    .map((idea) => idea.content as AdCreativeContent)
    .flatMap((content) => [content.headline, content.body.split("\n")[0]])
    .filter(Boolean)
    .slice(0, 12);

  const { headlines: h, descriptions: d } = GOOGLE_RSA;
  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({ schema: DraftSchema }),
    system: [
      `You write Google Search responsive search ads for ${brand.name}.`,
      `Each ad is a pool Google mixes: ${h.max} headlines of at most ${h.chars} characters and ${d.max} descriptions of at most ${d.chars} characters. Count characters; a longer line is thrown away.`,
      "Headlines must each stand alone and read well in any order and combination. Vary them: the place, the stay, a concrete amenity, a booking reason, the brand name once, a call to action.",
      "Use ONLY what the landing page says. Never invent an amenity, a price, a rating, a discount or availability.",
      "Where the searcher's terms are given, put the strongest of them in a few headlines word for word.",
      "No exclamation marks, no all-caps words, no emoji, no hashtags.",
      `Write ${count} ad(s), each from a different angle.`,
      brandStorySection({ brandName: brand.name, story: story?.story ?? null }),
    ].join("\n"),
    prompt: [
      `Landing page: ${landingUrl}`,
      page.title ? `Title: ${page.title}` : "",
      "",
      page.content.slice(0, PAGE_CHARS),
      "",
      terms.length
        ? `What the audiences search for: ${terms.slice(0, 40).join(", ")}`
        : "",
      messages.length
        ? `The campaign's other ads lead with: ${messages.join(" | ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const fit = (lines: string[], max: number, chars: number) =>
    [...new Set(lines.map((line) => line.trim()).filter(Boolean))]
      .filter((line) => line.length <= chars)
      .slice(0, max);
  const drafts = output.ads
    .map((ad) => ({
      angle: ad.angle.trim() || "Search",
      headlines: fit(ad.headlines, h.max, h.chars),
      descriptions: fit(ad.descriptions, d.max, d.chars),
    }))
    .filter(
      (ad) => ad.headlines.length >= h.min && ad.descriptions.length >= d.min,
    );
  if (drafts.length === 0) {
    throw new Error("The draft came back over Google's limits; try again");
  }

  const rows = await db
    .insert(adTable)
    .values(
      drafts.map((draft) => ({
        id: createId("ad"),
        brandId: brand.id,
        campaignId: campaign?.id ?? null,
        name: `Search · ${draft.angle}`,
        type: "text" as const,
        status: "drawn" as const,
        content: {
          headlines: draft.headlines,
          descriptions: draft.descriptions,
          linkUrl: landingUrl,
        },
      })),
    )
    .returning({ id: adTable.id });
  return { created: rows.length, adIds: rows.map((row) => row.id) };
}
