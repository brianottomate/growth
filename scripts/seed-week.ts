/**
 * seed-week.ts — additive seed of a wholistic, evenly-distributed week of
 * Wander content for the Feed, June 4–10 2026. Bespoke X takes, a few blog
 * posts, cross-posted IG+TikTok reels, plus IG/FB/LinkedIn/newsletter fill.
 *
 *   bun run scripts/seed-week.ts
 *
 * Does NOT wipe anything (unlike db:seed). Idempotent: rows are tagged
 * metadata.seedBatch = SEED_BATCH and deleted+reinserted on each run.
 * All rows are isSeed=true, so `db:unseed` removes them too.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/brand-schema";
import { channelTable } from "@/server/db/channel-schema";
import {
  contentPostTable,
  platformPostTable,
  seriesTable,
  type MediaItem,
} from "@/server/db/content-schema";
import { userTable } from "@/server/db/auth-schema";
import { createId } from "@/server/db/utils";

const OWNER_EMAIL = "kristian@wander.com";
const SEED_BATCH = "week-jun-2026";

// ---- helpers -------------------------------------------------------

// Local-time date for June (4 + offset), at hour. June = month index 5.
const dayAt = (offset: number, hour: number) =>
  new Date(2026, 5, 4 + offset, hour, 0, 0);

const img = (seed: string, w = 1080, h = 1350): MediaItem => ({
  url: `https://picsum.photos/seed/${seed}/${w}/${h}`,
  type: "image",
  width: w,
  height: h,
});
const reel = (seed: string): MediaItem => {
  const poster = `https://picsum.photos/seed/${seed}/1080/1920`;
  return {
    url: poster,
    thumbnail: poster,
    type: "video",
    width: 1080,
    height: 1920,
  };
};
const cover = (seed: string): MediaItem => img(seed, 1200, 630);

const providerFor = (platform: string): "native" | "customerio" | "zernio" =>
  platform === "blog"
    ? "native"
    : platform === "newsletter"
      ? "customerio"
      : "zernio";

const blogUrl = (slug: string) => `https://wander.com/blog/${slug}`;

// ---- content plan --------------------------------------------------

type Rendering = {
  platform: string;
  text: string;
  media?: "reel" | "image" | "cover";
  blogSlug?: string; // blog only → externalUrl + externalKind
};
type Idea = {
  title: string;
  pillar: string;
  series?: "summer" | "reels" | "notes";
  day: number; // 0..6 → Jun 4..10
  renderings: Rendering[];
};

const IDEAS: Idea[] = [
  // ── Wed Jun 4 ──────────────────────────────────────────────────
  {
    title: "Stay of the Day: Malibu cliffside",
    pillar: "travel-inspiration",
    series: "reels",
    day: 0,
    renderings: [
      {
        platform: "instagram",
        text: "POV: your morning coffee comes with a 180° ocean view. Malibu, this week. →",
        media: "reel",
      },
      {
        platform: "tiktok",
        text: "We found the cliffside stay TikTok won't stop asking about 🌊 #traveltok #malibu",
        media: "reel",
      },
    ],
  },
  {
    title: "The kitchen test",
    pillar: "wander-experience",
    series: "notes",
    day: 0,
    renderings: [
      {
        platform: "x",
        text: "Hot take: the best amenity in any stay isn't the pool. It's a kitchen you'd actually want to cook in. We design every Wander around that.",
      },
    ],
  },
  {
    title: "The Ultimate Big Sur Weekend",
    pillar: "travel-guides",
    series: "summer",
    day: 0,
    renderings: [
      {
        platform: "blog",
        text: "The Ultimate Big Sur Weekend Itinerary: where to stay, when to catch the fog, and the one cliffside desk worth the drive.",
        media: "cover",
        blogSlug: "ultimate-big-sur-weekend",
      },
      {
        platform: "x",
        text: "We wrote the Big Sur weekend guide we wish we'd had. Fog timing, trailheads, and where to actually stay ↓",
      },
    ],
  },

  // ── Thu Jun 5 ──────────────────────────────────────────────────
  {
    title: "Stay of the Day: Joshua Tree dome",
    pillar: "travel-inspiration",
    series: "reels",
    day: 1,
    renderings: [
      {
        platform: "instagram",
        text: "Golden hour hits different under a glass dome in the desert. Tap to feel it. →",
        media: "reel",
      },
      {
        platform: "tiktok",
        text: "this is your sign to trade notifications for stars ✨ #joshuatree #desert",
        media: "reel",
      },
    ],
  },
  {
    title: "Check-in, reimagined",
    pillar: "wander-experience",
    series: "notes",
    day: 1,
    renderings: [
      {
        platform: "x",
        text: "We killed “check-in at 4, check-out by 10.” Every Wander does its own thing now, because your trip shouldn't run on a hotel's clock.",
      },
    ],
  },
  {
    title: "Poolside in Scottsdale",
    pillar: "travel-inspiration",
    day: 1,
    renderings: [
      {
        platform: "instagram",
        text: "Some desks face a wall. This one faces a pool in Scottsdale. →",
        media: "image",
      },
    ],
  },

  // ── Fri Jun 6 ──────────────────────────────────────────────────
  {
    title: "Where to Stay in Lake Tahoe",
    pillar: "travel-guides",
    series: "summer",
    day: 2,
    renderings: [
      {
        platform: "blog",
        text: "Where to Stay in Lake Tahoe: a local's guide to the three best shorelines, two trailheads, and the stays with the fastest wifi.",
        media: "cover",
        blogSlug: "where-to-stay-lake-tahoe",
      },
      {
        platform: "newsletter",
        text: "Pack for the lake: our Tahoe guide is live, plus three stays we'd book this weekend.",
      },
    ],
  },
  {
    title: "July is open",
    pillar: "announcements",
    day: 2,
    renderings: [
      {
        platform: "x",
        text: "July just opened across the network. The lake houses and desert domes go first — here's what we'd grab before the long weekend ↓",
      },
    ],
  },
  {
    title: "The invisible work",
    pillar: "wander-experience",
    day: 2,
    renderings: [
      {
        platform: "linkedin",
        text: "A great stay feels effortless. It's the opposite. A short look at the invisible work — the restock, the walkthrough, the handwritten note — behind every Wander.",
      },
    ],
  },

  // ── Sat Jun 7 ──────────────────────────────────────────────────
  {
    title: "Stay of the Day: Aspen A-frame",
    pillar: "travel-inspiration",
    series: "reels",
    day: 3,
    renderings: [
      {
        platform: "instagram",
        text: "An A-frame, a wood stove, and nowhere you have to be. Aspen is calling. →",
        media: "reel",
      },
      {
        platform: "tiktok",
        text: "the cabin core summer arc starts here 🪵🏔️ #cabin #aspen #cozy",
        media: "reel",
      },
    ],
  },
  {
    title: "Weekend drop: ocean view",
    pillar: "announcements",
    day: 3,
    renderings: [
      {
        platform: "facebook",
        text: "Weekend drop: 3 nights, ocean view, instant book. Tag who you'd bring before it's gone.",
        media: "image",
      },
    ],
  },
  {
    title: "Saturday thought",
    pillar: "customer-stories",
    series: "notes",
    day: 3,
    renderings: [
      {
        platform: "x",
        text: "A guest told us they came for a long weekend and rebooked for a month before they left. That's the whole business in one sentence.",
      },
    ],
  },

  // ── Sun Jun 8 ──────────────────────────────────────────────────
  {
    title: "Member story: a month in Costa Rica",
    pillar: "customer-stories",
    day: 4,
    renderings: [
      {
        platform: "instagram",
        text: "“I ran my whole startup from a hammock for 30 days.” — Priya, on a month in Costa Rica.",
        media: "image",
      },
      {
        platform: "tiktok",
        text: "she answered standups from a hammock for 30 days. here's how it actually went 🇨🇷",
        media: "reel",
      },
    ],
  },
  {
    title: "Sunday note: rebook rate",
    pillar: "wander-experience",
    series: "notes",
    day: 4,
    renderings: [
      {
        platform: "x",
        text: "Sunday thought: the truest signal a stay was great isn't the review. It's whether they come back. We watch rebook rate over everything.",
      },
    ],
  },

  // ── Mon Jun 9 ──────────────────────────────────────────────────
  {
    title: "Pet-friendly luxury stays",
    pillar: "travel-guides",
    series: "summer",
    day: 5,
    renderings: [
      {
        platform: "blog",
        text: "10 Pet-Friendly Luxury Stays for Summer: the homes where the dog gets a better view than you do.",
        media: "cover",
        blogSlug: "pet-friendly-luxury-stays-summer",
      },
    ],
  },
  {
    title: "Stay of the Day: Topanga canyon",
    pillar: "travel-inspiration",
    series: "reels",
    day: 5,
    renderings: [
      {
        platform: "instagram",
        text: "Canyon light, a deck in the trees, and zero meetings you couldn't take outside. Topanga →",
        media: "reel",
      },
      {
        platform: "tiktok",
        text: "wfh but make it a canyon in topanga 🌿 #wfh #topanga #remotework",
        media: "reel",
      },
    ],
  },
  {
    title: "Mountains or coast?",
    pillar: "travel-inspiration",
    series: "notes",
    day: 5,
    renderings: [
      {
        platform: "x",
        text: "Mountains or coast for your next work-from-anywhere week? Reply with one emoji and we'll send you a stay for it.",
      },
    ],
  },

  // ── Tue Jun 10 ─────────────────────────────────────────────────
  {
    title: "The Dispatch: Summer Escapes",
    pillar: "travel-inspiration",
    series: "summer",
    day: 6,
    renderings: [
      {
        platform: "newsletter",
        text: "Summer Escapes edition: five stays for the season, one member story, and the long-weekend guide you'll forward to your group chat.",
      },
    ],
  },
  {
    title: "Stay of the Day: Hudson Valley barn",
    pillar: "travel-inspiration",
    series: "reels",
    day: 6,
    renderings: [
      {
        platform: "instagram",
        text: "A restored barn, a claw-foot tub, and the kind of quiet you can hear. Hudson Valley →",
        media: "reel",
      },
      {
        platform: "tiktok",
        text: "restored barn + claw-foot tub + total silence = the reset 🛁 #hudsonvalley #upstate",
        media: "reel",
      },
    ],
  },
  {
    title: "What hospitality means to us",
    pillar: "wander-experience",
    series: "notes",
    day: 6,
    renderings: [
      {
        platform: "x",
        text: "Hospitality is a thousand small decisions made before you arrive. The handwritten note is just the one you can see.",
      },
    ],
  },
];

async function main() {
  const owner = await db.query.userTable.findFirst({
    where: eq(userTable.email, OWNER_EMAIL),
  });
  if (!owner) throw new Error(`No user ${OWNER_EMAIL}`);
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.slug, "wander"),
  });
  if (!brand) throw new Error("No 'wander' brand");

  const channels = await db
    .select()
    .from(channelTable)
    .where(eq(channelTable.brandId, brand.id));
  const chan = (p: string) =>
    channels.find((c) => c.platform === p)?.id ?? null;
  const handle = (p: string) =>
    channels.find((c) => c.platform === p)?.handle ?? null;

  // Idempotency: clear any prior run of this batch (platform_posts first).
  const batchEq = sql`metadata->>'seedBatch' = ${SEED_BATCH}`;
  await db.delete(platformPostTable).where(batchEq);
  await db.delete(contentPostTable).where(batchEq);
  await db
    .delete(seriesTable)
    .where(
      sql`slug in ('summer-escapes-2026','stay-of-the-day','field-notes')`,
    );

  // Series
  const seriesIds = {
    summer: createId("series"),
    reels: createId("series"),
    notes: createId("series"),
  };
  await db.insert(seriesTable).values([
    {
      id: seriesIds.summer,
      brandId: brand.id,
      name: "Summer Escapes 2026",
      slug: "summer-escapes-2026",
      description: "The season's guides, lists, and the stays worth the drive.",
      theme: "Summer",
      color: "#f59e0b",
      status: "active",
      startAt: dayAt(0, 0),
      endAt: dayAt(60, 0),
    },
    {
      id: seriesIds.reels,
      brandId: brand.id,
      name: "Stay of the Day",
      slug: "stay-of-the-day",
      description: "Daily cross-posted reels — one stay, IG + TikTok.",
      theme: "Reels",
      color: "#ec4899",
      status: "active",
      startAt: dayAt(0, 0),
    },
    {
      id: seriesIds.notes,
      brandId: brand.id,
      name: "Field Notes",
      slug: "field-notes",
      description: "Short, bespoke takes on hospitality and travel — X-first.",
      theme: "POV",
      color: "#38bdf8",
      status: "active",
      startAt: dayAt(0, 0),
    },
  ]);

  const bulkContent: (typeof contentPostTable.$inferInsert)[] = [];
  const bulkPosts: (typeof platformPostTable.$inferInsert)[] = [];

  for (const idea of IDEAS) {
    const cid = createId("post");
    bulkContent.push({
      id: cid,
      brandId: brand.id,
      seriesId: idea.series ? seriesIds[idea.series] : null,
      ownerId: owner.id,
      createdById: owner.id,
      title: idea.title,
      pillar: idea.pillar,
      plannedAt: dayAt(idea.day, 9),
      status: "scheduled",
      origin: "human",
      metadata: { seedBatch: SEED_BATCH },
    });

    idea.renderings.forEach((r, i) => {
      const when = dayAt(idea.day, 8 + i * 4);
      const seed = `${cid}-${r.platform}`;
      const media: MediaItem[] | undefined =
        r.media === "reel"
          ? [reel(seed)]
          : r.media === "image"
            ? [img(seed)]
            : r.media === "cover"
              ? [cover(seed)]
              : undefined;
      bulkPosts.push({
        id: createId("pp"),
        brandId: brand.id,
        contentPostId: cid,
        channelId: chan(r.platform),
        platform:
          r.platform as (typeof platformPostTable.$inferInsert)["platform"],
        username: handle(r.platform),
        source: "owned",
        status: "scheduled",
        origin: "human",
        provider: providerFor(r.platform),
        text: r.text,
        media,
        externalKind: r.blogSlug ? "blog_article" : undefined,
        externalUrl: r.blogSlug ? blogUrl(r.blogSlug) : undefined,
        scheduledAt: when,
        isSeed: true,
        metadata: { seedBatch: SEED_BATCH },
      });
    });
  }

  await db
    .insert(contentPostTable)
    .values(bulkContent.map((r) => ({ ...r, isSeed: true })));
  await db.insert(platformPostTable).values(bulkPosts);

  const byPlatform: Record<string, number> = {};
  for (const p of bulkPosts)
    byPlatform[p.platform] = (byPlatform[p.platform] ?? 0) + 1;
  console.log(
    `✓ ${IDEAS.length} ideas → ${bulkContent.length} content_posts, ${bulkPosts.length} platform_posts (Jun 4–10)`,
  );
  console.table(byPlatform);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
