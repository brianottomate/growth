/**
 * Seed the Wander strategy backbone: per-channel cadence targets + content-mix
 * targets (brand default + per-channel overrides).
 *
 *   bun run scripts/seed-strategy-targets.ts
 *
 * Idempotent by full replace: wipes the brand's existing cadence_target and
 * mix_target rows and writes the current baseline.
 *
 * BASELINE (2026-07-03): the team's own sheet legend ("SOCIAL MEDIA CONTENT
 * CALENDAR" — pillar legend, platform guide, content-mix ratios), reconciled
 * with the 2026-07-02 data-derived proposal where the sheet is silent:
 * - IG reels 4/wk + carousels 2/wk per the sheet; image 1/wk kept from the
 *   data pass (top avg engagement, sheet omits the format).
 * - Stories 3/wk planned NARRATIVES per Kristian (sheet says "Daily Stories",
 *   but dailies are reactive community pulse, not month-ahead briefs).
 * - TikTok 5/wk (sheet 5–7, low end), YouTube Shorts 3/wk repurposed.
 * - Pinterest stays 10 SLOTS/mo: the sheet's "10–15 pins/day" counts pins,
 *   not planning units — one slot = one batched board drop.
 * - LinkedIn/X/Facebook aren't in the sheet (it predates those lanes); the
 *   peer-informed targets stay.
 * - Mix = sheet ratios mapped to pillar slugs: Discovery 25 / Inspiration 25 /
 *   Entertainment 20 / Trust 10 + Customer Stories 5 (sheet folds stories
 *   under Trust) / Insider 10 / "Conversion 5%" → timely-travel 5 (seasonal
 *   urgency IS the conversion lane; the sheet's pillar legend has Timely
 *   Travel but its mix table doesn't — this reconciles both).
 */
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  cadenceTargetTable,
  channelTable,
  mixTargetTable,
} from "@/server/db/schema";

const BRAND_SLUG = "wander";

// channel platform → archetype targets. Rationale (observed + peers):
// IG carousels/images out-engage reels (Rimowa-validated); TikTok held at
// current volume; LinkedIn is the peer-informed whitespace (Airbnb video_long);
// X texts get ~35 views → reduced, native video is the only pop; YT Shorts are
// TikTok repurposes; Pinterest = batched seasonal board drops.
const CADENCE: Record<
  string,
  { archetype: string; count: number; period: "day" | "week" | "month"; notes?: string }[]
> = {
  instagram: [
    { archetype: "video_short", count: 4, period: "week", notes: "Sheet platform guide: 4–5 Reels/wk (reach)" },
    { archetype: "carousel", count: 2, period: "week", notes: "Sheet: 2 Carousels/wk (saves); also best observed engagement (7.8k avg views)" },
    { archetype: "image", count: 1, period: "week", notes: "Data-informed addition — sheet omits the format but images match carousels on engagement" },
    { archetype: "story", count: 3, period: "week", notes: "One slot = one story NARRATIVE (1 frame or a 5-frame series). Sheet says Daily Stories — dailies stay reactive, these are the planned ones" },
  ],
  tiktok: [
    { archetype: "video_short", count: 4, period: "week", notes: "Sheet: 5–7 posts/wk total (low end taken)" },
    { archetype: "carousel", count: 1, period: "week" },
  ],
  linkedin: [
    { archetype: "image", count: 1, period: "week", notes: "New lane — peer whitespace (Airbnb/Outsite/Rimowa all invest)" },
    { archetype: "video_long", count: 1, period: "week", notes: "Airbnb's power format (1.4k avg likes); text post as fallback" },
  ],
  x: [
    { archetype: "text", count: 3, period: "week", notes: "Down from daily (35 avg views); slot-planned per Kristian 2026-07-03 — a planned tweet lane" },
    { archetype: "video_short", count: 2, period: "month", notes: "The only format that has ever popped here (712k avg)" },
  ],
  facebook: [
    { archetype: "image", count: 2, period: "week", notes: "IG crosspost mirror — fill by adding a FB spot to the IG idea; slot shells merge on fill" },
    { archetype: "video_short", count: 1, period: "week", notes: "IG reel crosspost" },
  ],
  youtube: [
    { archetype: "video_long", count: 2, period: "month", notes: "48-hours-in itineraries (data-informed; sheet only covers Shorts)" },
    { archetype: "video_short", count: 3, period: "week", notes: "Sheet: 3–4 repurposed TikTok/Reels per week" },
  ],
  pinterest: [
    { archetype: "image", count: 10, period: "month", notes: "One slot = one batched board drop (the sheet's 10–15 pins/DAY counts pins, not planning units)" },
  ],
};

// Pillar mixes (percent). null channel = brand-wide default.
// The sheet's CONTENT MIX RATIOS mapped to pillar slugs (see header comment).
const BRAND_MIX: Record<string, number> = {
  "travel-discovery": 25,
  "travel-inspiration": 25,
  entertainment: 20,
  "brand-trust": 10,
  "insider-community": 10,
  "timely-travel": 5,
  "customer-stories": 5,
};

const CHANNEL_MIX: Record<string, Record<string, number>> = {
  instagram: {
    "travel-discovery": 30,
    "travel-inspiration": 15,
    "timely-travel": 15,
    "brand-trust": 10,
    "customer-stories": 10,
    entertainment: 10,
    "insider-community": 10,
  },
  tiktok: {
    "travel-discovery": 40,
    "timely-travel": 25,
    entertainment: 25,
    "travel-inspiration": 10,
  },
  linkedin: {
    "brand-trust": 40,
    announcements: 25,
    "wander-experience": 20,
    "timely-travel": 15,
  },
  x: {
    "timely-travel": 40,
    announcements: 30,
    entertainment: 30,
  },
  youtube: {
    "travel-discovery": 70,
    "timely-travel": 30,
  },
  pinterest: {
    "travel-discovery": 70,
    "timely-travel": 30,
  },
};

const brand = await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, BRAND_SLUG),
});
if (!brand) throw new Error(`brand "${BRAND_SLUG}" not found`);

const channels = await db.query.channelTable.findMany({
  where: eq(channelTable.brandId, brand.id),
});
const channelByPlatform = new Map(channels.map((c) => [c.platform, c]));

// Full replace for this brand.
await db.delete(cadenceTargetTable).where(eq(cadenceTargetTable.brandId, brand.id));
await db.delete(mixTargetTable).where(eq(mixTargetTable.brandId, brand.id));

let cadCount = 0;
for (const [platform, targets] of Object.entries(CADENCE)) {
  const channel = channelByPlatform.get(platform as never);
  if (!channel) {
    console.warn(`! no ${platform} channel for ${brand.name} — skipped`);
    continue;
  }
  for (const t of targets) {
    await db.insert(cadenceTargetTable).values({
      brandId: brand.id,
      channelId: channel.id,
      platform: channel.platform,
      archetype: t.archetype,
      count: t.count,
      period: t.period,
      notes: t.notes,
    });
    cadCount++;
  }
}

let mixCount = 0;
for (const [pillar, targetPct] of Object.entries(BRAND_MIX)) {
  await db.insert(mixTargetTable).values({
    brandId: brand.id,
    channelId: null,
    pillar,
    targetPct,
    period: "month",
  });
  mixCount++;
}
for (const [platform, mix] of Object.entries(CHANNEL_MIX)) {
  const channel = channelByPlatform.get(platform as never);
  if (!channel) continue;
  for (const [pillar, targetPct] of Object.entries(mix)) {
    await db.insert(mixTargetTable).values({
      brandId: brand.id,
      channelId: channel.id,
      pillar,
      targetPct,
      period: "month",
    });
    mixCount++;
  }
}

console.log(
  `seeded ${cadCount} cadence targets + ${mixCount} mix rows (brand default + ${Object.keys(CHANNEL_MIX).length} channel overrides) for ${brand.name}`,
);
process.exit(0);
