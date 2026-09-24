import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { and, eq, isNull } from "drizzle-orm";

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
  story: string | null;
}) {
  const story = input.story?.trim() || null;
  await db
    .update(brandTable)
    .set({ story })
    .where(eq(brandTable.id, input.brandId));
  return { story };
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
export async function draftBrandStory(input: { brandId: string }) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, input.brandId),
    columns: {
      id: true,
      name: true,
      website: true,
      tagline: true,
      description: true,
      brandIdentity: true,
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
  const { system, prompt } = brandStoryDraftPrompt({
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
  const { text } = await generateText({
    model: anthropic(MODEL),
    system,
    prompt,
  });
  return setBrandStory({ brandId: brand.id, story: text });
}
