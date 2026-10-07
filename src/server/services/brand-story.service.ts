import "server-only";
import {
  creativeDirectionSchema,
  type CreativeDirection,
} from "@/lib/brand-direction";
import { operatorSteeringSection } from "@/lib/generation-steer";
import {
  brandStoryResultSchema,
  requireBrandStory,
} from "@/lib/brand-evidence";
import { loadBrandStoryPages } from "@/lib/brand-website-content";
import { scrapeUrl } from "@/server/clients/firecrawl.client";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, isNull, sql } from "drizzle-orm";

import { brandStoryDraftPrompt } from "@/server/ai/prompts";
import { executeQuery } from "@/server/clients/bigquery.client";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";

// The brand story: a short brief of what makes a brand itself, who books it,
// its voice and what to avoid. Every creative prompt for the brand includes
// it (see `brandStorySection`). It starts as an AI draft from what the brand
// already shows, the operator edits it on the Setup page, and the agent adds
// to it with brandWrite.update when a correction says something about the
// brand as a whole.

const MODEL = "claude-sonnet-5";

export async function setBrandStory(input: {
  brandId: string;
  story?: string | null;
  creativeDirection?: CreativeDirection | null;
}) {
  const story = input.story?.trim() || null;
  const [saved] = await db
    .update(brandTable)
    .set({
      ...(input.story !== undefined ? { story } : {}),
      ...(input.creativeDirection !== undefined
        ? { creativeDirection: input.creativeDirection }
        : {}),
    })
    .where(eq(brandTable.id, input.brandId))
    .returning({
      story: brandTable.story,
      creativeDirection: brandTable.creativeDirection,
    });
  if (!saved) throw new Error("Brand not found");
  return saved;
}

/**
 * A handful of things guests said they liked, for the first draft only. The
 * story must not depend on BigQuery, so any failure here drafts without it.
 */
async function guestQuotes(listingIds: string[]) {
  if (listingIds.length === 0) return "";
  try {
    const rows = await executeQuery<{ liked: string }>(
      `
      SELECT SUBSTR(what_did_you_like, 1, 200) AS liked
      FROM \`wander-9fc9c.analytics.int_reviews\`
      WHERE id_unit IN UNNEST(@ids) AND ts_deleted IS NULL
        AND LENGTH(TRIM(what_did_you_like)) > 20
      ORDER BY ts_created DESC
      LIMIT 20
      `,
      { ids: listingIds },
      { ids: ["STRING"] },
    );
    return rows.map((row) => `"${row.liked.trim()}"`).join(" ");
  } catch (error) {
    console.error(
      "Guest quotes for the brand story failed",
      error instanceof Error ? error.message : error,
    );
    return "";
  }
}

/** Draft a story from the brand's site identity, homes and guests, and save it. */
export async function draftBrandStory(input: {
  brandId: string;
  steer?: string;
}) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, input.brandId),
    columns: {
      id: true,
      name: true,
      website: true,
      tagline: true,
      description: true,
      brandIdentity: true,
      websiteMeta: true,
      story: true,
      creativeDirection: true,
      updatedAt: true,
    },
  });
  if (!brand) throw new Error("Brand not found");
  const homes = await db.query.homeTable.findMany({
    where: and(eq(homeTable.brandId, brand.id), isNull(homeTable.deletedAt)),
    columns: {
      externalId: true,
      source: true,
      name: true,
      city: true,
      state: true,
      bedrooms: true,
      guests: true,
      amenities: true,
    },
    limit: 40,
  });
  const pages = brand.website
    ? await loadBrandStoryPages(brand.website, brand.websiteMeta, scrapeUrl)
    : { homepage: undefined, about: undefined };
  const snapshots = Object.fromEntries(
    Object.entries(pages).filter(([, page]) => Boolean(page)),
  );
  const { system, prompt } = brandStoryDraftPrompt({
    websiteContent: [pages.homepage, pages.about]
      .filter(Boolean)
      .map(
        (page) =>
          `Source: ${page!.url} (scraped ${page!.scrapedAt})\n${page!.markdown.slice(0, 18000)}`,
      )
      .join("\n\n"),
    brandName: brand.name,
    website: brand.website,
    identity: JSON.stringify({
      tagline: brand.tagline,
      description: brand.description,
      personality: brand.brandIdentity?.personality ?? null,
    }).slice(0, 1500),
    homes: JSON.stringify(
      homes.slice(0, 25).map((home) => ({
        name: home.name,
        place: [home.city, home.state].filter(Boolean).join(", "),
        bedrooms: home.bedrooms,
        guests: home.guests,
        amenities: home.amenities?.slice(0, 8) ?? [],
      })),
    ),
    guestQuotes: await guestQuotes(
      homes
        .filter((home) => home.source === "wanderos")
        .map((home) => home.externalId),
    ),
  });
  const { output } = await generateText({
    model: anthropic(MODEL),
    system,
    prompt:
      prompt +
      `\n\nCurrent saved brief and direction (preserve accepted choices unless steered otherwise):\n${JSON.stringify({ story: brand.story, creativeDirection: brand.creativeDirection })}` +
      operatorSteeringSection(input.steer),
    output: Output.object({
      schema: brandStoryResultSchema.extend({
        creativeDirection: creativeDirectionSchema.nullable(),
      }),
    }),
  });
  if (!output)
    throw new Error(
      "No story was returned. Check the website or import homes before trying again.",
    );
  const story = requireBrandStory(output);
  if (!output.creativeDirection)
    throw new Error(
      "No creative direction returned; existing content was preserved.",
    );
  const saved = await db
    .update(brandTable)
    .set({
      story,
      creativeDirection: output.creativeDirection,
      ...(Object.keys(snapshots).length
        ? {
            websiteMeta: sql`coalesce(${brandTable.websiteMeta}, '{}'::jsonb) || ${JSON.stringify(snapshots)}::jsonb`,
          }
        : {}),
    })
    .where(
      and(
        eq(brandTable.id, brand.id),
        eq(brandTable.updatedAt, brand.updatedAt),
      ),
    )
    .returning({ id: brandTable.id });
  if (!saved.length)
    throw new Error(
      "The brand changed while writing. Read it again and retry; your edits were preserved.",
    );
  return { story, creativeDirection: output.creativeDirection };
}
