/**
 * Seed the Wander strategy backbone: per-channel cadence targets + content-mix
 * targets (brand default + per-channel overrides).
 *
 *   bun run scripts/seed-strategy-targets.ts
 *
 * Idempotent by full replace: wipes the brand's existing cadence_target and
 * mix_target rows and writes the current proposal. Derived 2026-07-02 from
 * May–Jun observed performance + peer benchmarks (Airbnb/Outsite/Rimowa/Vrbo)
 * — see the session writeup; edit numbers on /channels or here and re-run.
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
    { archetype: "carousel", count: 2, period: "week", notes: "Best avg engagement (7.8k views); Rimowa-validated luxury format" },
    { archetype: "video_short", count: 2, period: "week" },
    { archetype: "image", count: 1, period: "week" },
  ],
  tiktok: [
    { archetype: "video_short", count: 2, period: "week", notes: "Hold volume until reach improves (~600 avg views)" },
    { archetype: "carousel", count: 1, period: "week" },
  ],
  linkedin: [
    { archetype: "image", count: 1, period: "week", notes: "New lane — peer whitespace (Airbnb/Outsite/Rimowa all invest)" },
    { archetype: "video_long", count: 1, period: "week", notes: "Airbnb's power format (1.4k avg likes); text post as fallback" },
  ],
  x: [
    { archetype: "text", count: 3, period: "week", notes: "Down from daily — 35 avg views; amplification-grade, not slot-planned" },
    { archetype: "video_short", count: 2, period: "month", notes: "The only format that has ever popped here (712k avg)" },
  ],
  youtube: [
    { archetype: "video_long", count: 2, period: "month", notes: "48-hours-in itineraries" },
    { archetype: "video_short", count: 4, period: "month", notes: "Repurposed from top TikToks" },
  ],
  pinterest: [
    { archetype: "image", count: 10, period: "month", notes: "Seasonal board drops, batched" },
  ],
};

// Pillar mixes (percent, per month). null channel = brand-wide default.
const BRAND_MIX: Record<string, number> = {
  "travel-discovery": 35,
  "timely-travel": 15,
  "brand-trust": 15,
  "travel-inspiration": 10,
  entertainment: 10,
  "customer-stories": 10,
  "insider-community": 5,
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
