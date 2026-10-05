import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  brandMarketsSchema,
  marketId,
  marketSchema,
  type BrandMarkets,
} from "@/lib/markets";
import {
  brandMarketsDraftPrompt,
  brandStorySection,
} from "@/server/ai/prompts";
import { fetchWanderOsListingDetail } from "@/server/clients/wanderos-site.client";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";

import { brandWebsiteId } from "./wanderos-listings.service";

const MODEL = "claude-sonnet-5";
/** Listing detail reads per draft: a couple of homes per town is enough. */
const PER_TOWN = 2;
const MAX_READS = 16;

/** The brand's towns, with how many homes each has and what the listings say. */
async function brandTowns(brandId: string) {
  const homes = await db.query.homeTable.findMany({
    where: and(eq(homeTable.brandId, brandId), isNull(homeTable.deletedAt)),
    columns: { externalId: true, source: true, city: true, state: true },
  });
  const towns = new Map<
    string,
    { town: string; state: string | null; homes: number; ids: string[] }
  >();
  for (const home of homes) {
    if (!home.city) continue;
    const key = `${home.city}|${home.state ?? ""}`;
    const entry = towns.get(key) ?? {
      town: home.city,
      state: home.state,
      homes: 0,
      ids: [],
    };
    entry.homes++;
    if (home.source === "wanderos" && entry.ids.length < PER_TOWN)
      entry.ids.push(home.externalId);
    towns.set(key, entry);
  }
  return [...towns.values()].sort((a, b) => b.homes - a.homes);
}

const draftSchema = z.object({
  markets: z
    .array(marketSchema.omit({ id: true }))
    .min(1)
    .max(12),
});

/** Draft the brand's markets from its homes' towns and listings; used at once. */
export async function draftBrandMarkets(input: { brandId: string }) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, input.brandId),
    columns: { id: true, name: true, website: true, story: true },
  });
  if (!brand) throw new Error("Brand not found");
  const towns = await brandTowns(brand.id);
  if (!towns.length)
    throw new Error(
      "Import homes with city or town details before defining destinations.",
    );
  const websiteId = await brandWebsiteId(brand.id);
  let reads = 0;
  const described = await Promise.all(
    towns.map(async (town) => {
      const ids = town.ids.slice(0, Math.max(0, MAX_READS - reads));
      reads += ids.length;
      const paragraphs = websiteId
        ? await Promise.all(
            ids.map((propertyId) =>
              fetchWanderOsListingDetail({ websiteId, propertyId })
                .then((detail) => detail.locationDescription?.slice(0, 600))
                .catch(() => undefined),
            ),
          )
        : [];
      return {
        town: town.town,
        state: town.state,
        homes: town.homes,
        listingsSay: paragraphs.filter(Boolean),
      };
    }),
  );
  const { system, prompt } = brandMarketsDraftPrompt({
    brandName: brand.name,
    website: brand.website,
    story: brandStorySection({ brandName: brand.name, story: brand.story }),
    towns: JSON.stringify(described),
  });
  const { output } = await generateText({
    model: anthropic(MODEL),
    system,
    prompt,
    output: Output.object({ schema: draftSchema }),
    providerOptions: { anthropic: { effort: "medium" } },
  });
  // Every town lands in a market: one the draft missed gets its own.
  const known = new Set(
    output.markets.flatMap((m) => m.towns.map((t) => t.toLowerCase())),
  );
  const missed = towns.filter((t) => !known.has(t.town.toLowerCase()));
  const markets = [
    ...output.markets,
    ...missed.map((t) => ({
      label: [t.town, t.state].filter(Boolean).join(", ").slice(0, 40),
      towns: [t.town],
    })),
  ].map((market) => ({ ...market, id: marketId(market.label) }));
  return saveBrandMarkets({
    brandId: brand.id,
    value: { markets, draftedAt: new Date().toISOString(), confirmedAt: null },
  });
}

/** Save the markets as the operator edited or confirmed them. */
export async function setBrandMarkets(input: {
  brandId: string;
  userId: string;
  markets: BrandMarkets["markets"];
}) {
  const current = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, input.brandId),
    columns: { markets: true },
  });
  return saveBrandMarkets({
    brandId: input.brandId,
    value: {
      markets: input.markets.map((market) => ({
        ...market,
        id: market.id || marketId(market.label),
      })),
      draftedAt: current?.markets?.draftedAt,
      confirmedAt: new Date().toISOString(),
      confirmedBy: input.userId,
    },
  });
}

async function saveBrandMarkets(input: {
  brandId: string;
  value: BrandMarkets;
}) {
  const markets = brandMarketsSchema.parse(input.value);
  await db
    .update(brandTable)
    .set({ markets })
    .where(eq(brandTable.id, input.brandId));
  return { markets };
}
