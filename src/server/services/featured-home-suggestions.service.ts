import { brandStrategyContext } from "./brand-strategy-context.service";
import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { executeQuery } from "@/server/clients/bigquery.client";
import { db } from "@/server/db";
import { homeTable } from "@/server/db/schema";

import {
  brandStorySection,
  featuredHomesPickPrompt,
} from "@/server/ai/prompts";

import { contactSheet } from "./starter-ad-generation.service";

// Which homes a Performance brand should feature: its hallmark homes, the
// ones worth showcasing, because the best home gets the click and a visitor
// who finds it booked searches the rest of the site.
//
// The numbers decide the shortlist: direct-site bookings first, then how
// well the home sells across every channel, then reviews. One model call
// then picks from the shortlist on creative, as the tie-breaker between
// homes whose numbers are close. Open nights are reported, never a gate.
//
// The count stays small (3 to 6) on purpose. Producing creative is no longer
// the bottleneck; spend is, and a few strong bets beat budget spread thin,
// with the catalog carrying the rest of the portfolio.

const MODEL = "claude-sonnet-5";
/** One contact sheet: the shortlist the model looks at. */
const SHORTLIST = 16;

export type HomeEvidence = {
  homeId: string;
  listingId: string;
  name: string;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  guests: number | null;
  amenities: unknown;
  /** Direct-site bookings over the last 12 months, confirmed and not cancelled. */
  directBookings: number;
  directValue: number;
  /** Share of sellable nights sold across all channels, last 90 days. */
  sold90: number | null;
  /** Open nights in the next 60 days. Context for the operator, not a filter. */
  open60: number | null;
  reviews: number;
  reviewScore: number | null;
};

type Row = {
  id_unit: string;
  direct_bookings: number | null;
  direct_value: number | null;
  sold_90: number | null;
  open_60: number | null;
  reviews: number | null;
  review_score: number | null;
};

/**
 * Per-home evidence from BigQuery. `id_unit` in the analytics tables is the
 * WanderOS listing id, which is our `home.externalId`, so the brand's own
 * homes are the filter and no organization id is needed.
 */
export async function evidenceFor(listingIds: string[]) {
  return executeQuery<Row>(
    `
    WITH direct AS (
      SELECT b.id_unit, COUNT(*) AS direct_bookings,
        ROUND(SUM(r.booking_total)) AS direct_value
      FROM \`wander-9fc9c.analytics.bookings\` b
      LEFT JOIN \`wander-9fc9c.analytics.bookings_reconciled\` r USING (id_booking)
      WHERE b.id_unit IN UNNEST(@ids)
        AND b.channel = 'direct_website' AND b.is_wander_saas
        AND b.status = 'confirmed' AND b.is_profit AND NOT b.is_manual_booking
        AND b.ts_confirmed IS NOT NULL AND b.ts_canceled IS NULL
        AND b.ts_confirmed >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH))
      GROUP BY b.id_unit
    ),
    calendar AS (
      SELECT id_unit,
        ROUND(SAFE_DIVIDE(
          SUM(IF(dt < CURRENT_DATE(), booked + external_booked, 0)),
          SUM(IF(dt < CURRENT_DATE(), available + booked + external_booked, 0))
        ), 2) AS sold_90,
        SUM(IF(dt >= CURRENT_DATE(), available, 0)) AS open_60
      FROM \`wander-9fc9c.analytics.calendars\`
      WHERE id_unit IN UNNEST(@ids)
        AND dt BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
          AND DATE_ADD(CURRENT_DATE(), INTERVAL 59 DAY)
      GROUP BY id_unit
    ),
    review_stats AS (
      SELECT id_unit, COUNT(*) AS reviews, ROUND(AVG(score), 2) AS review_score
      FROM \`wander-9fc9c.analytics.int_reviews\`
      WHERE id_unit IN UNNEST(@ids) AND ts_deleted IS NULL AND score IS NOT NULL
      GROUP BY id_unit
    )
    SELECT id_unit, direct_bookings, direct_value, sold_90, open_60, reviews, review_score
    FROM UNNEST(@ids) AS id_unit
    LEFT JOIN direct USING (id_unit)
    LEFT JOIN calendar USING (id_unit)
    LEFT JOIN review_stats USING (id_unit)
    `,
    { ids: listingIds },
    { ids: ["STRING"] },
  );
}

/** Direct value, then how it sells everywhere, then reviews. */
function byEvidence(a: HomeEvidence, b: HomeEvidence) {
  return (
    b.directValue - a.directValue ||
    (b.sold90 ?? 0) - (a.sold90 ?? 0) ||
    b.reviews - a.reviews
  );
}

export async function suggestFeaturedHomes(input: {
  brandId: string;
  brandName: string;
  /** The brand's story, which the pick weighs on creative. */
  brandStory: string | null;
  count: number;
}) {
  const strategy = await brandStrategyContext(input.brandId);
  const rows = await db.query.homeTable.findMany({
    where: and(
      eq(homeTable.brandId, input.brandId),
      eq(homeTable.source, "wanderos"),
      isNull(homeTable.deletedAt),
    ),
    columns: {
      id: true,
      externalId: true,
      name: true,
      heroSourceUrl: true,
      galleryCache: true,
      city: true,
      state: true,
      bedrooms: true,
      guests: true,
      amenities: true,
    },
  });
  if (rows.length === 0)
    throw new Error(
      "This brand has no ingested homes yet. Press Refresh homes on its Setup page first.",
    );

  const found = new Map(
    (await evidenceFor(rows.map((row) => row.externalId))).map((row) => [
      row.id_unit,
      row,
    ]),
  );
  const ranked: (HomeEvidence & { thumb: string | null })[] = rows
    .map((row) => {
      const e = found.get(row.externalId);
      return {
        homeId: row.id,
        listingId: row.externalId,
        name: row.name,
        city: row.city,
        state: row.state,
        bedrooms: row.bedrooms,
        guests: row.guests,
        amenities: row.amenities,
        directBookings: Number(e?.direct_bookings ?? 0),
        directValue: Number(e?.direct_value ?? 0),
        sold90: e?.sold_90 == null ? null : Number(e.sold_90),
        open60: e?.open_60 == null ? null : Number(e.open_60),
        reviews: Number(e?.reviews ?? 0),
        reviewScore: e?.review_score == null ? null : Number(e.review_score),
        thumb:
          row.galleryCache?.find((photo) => photo.url === row.heroSourceUrl)
            ?.thumbUrl ?? row.heroSourceUrl,
      };
    })
    .sort(byEvidence);

  const shortlist = ranked.filter((home) => home.thumb).slice(0, SHORTLIST);
  if (shortlist.length === 0)
    throw new Error(
      "None of this brand's homes has a hero photo yet. Press Refresh homes on its Setup page first.",
    );
  const count = Math.min(input.count, shortlist.length);
  const sheet = await contactSheet({
    id: input.brandId,
    name: input.brandName,
    url: "",
    photos: shortlist.map((home) => ({ url: home.thumb! })),
  });
  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({
      schema: z.object({
        photos: z
          .array(z.number().int())
          .describe("Photo numbers from the sheet, strongest first."),
      }),
    }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: featuredHomesPickPrompt({
              brandName: input.brandName,
              count,
              brandStory: brandStorySection({
                brandName: input.brandName,
                story: `${input.brandStory ?? ""}\nBrand strategy reference: ${strategy}`,
              }),
              candidates: shortlist.map((home, index) => ({
                photo: index + 1,
                name: home.name,
                city: home.city,
                state: home.state,
                bedrooms: home.bedrooms,
                guests: home.guests,
                amenities: home.amenities,
                open60: home.open60,
                directBookings12m: home.directBookings,
                directValue12m: home.directValue,
                sold90: home.sold90,
                reviews: home.reviews,
                reviewScore: home.reviewScore,
              })),
            }),
          },
          { type: "file", data: sheet.image, mediaType: "image/jpeg" },
        ],
      },
    ],
  });

  // Keep only numbers that are on the sheet, once each.
  const picked = [
    ...new Set(
      output.photos
        .filter((photo) => photo >= 1 && photo <= shortlist.length)
        .map((photo) => shortlist[photo - 1]!.homeId),
    ),
  ].slice(0, count);

  return {
    picks: picked,
    candidates: shortlist.map(
      ({
        thumb: _thumb,
        city: _city,
        state: _state,
        bedrooms: _bedrooms,
        guests: _guests,
        amenities: _amenities,
        ...home
      }) => ({
        ...home,
        picked: picked.includes(home.homeId),
      }),
    ),
  };
}
