/**
 * Seed the Wander growth back-office with realistic demo data.
 *
 *   bun run db:seed
 *
 * Idempotent: wipes the prior seed (the "wander" org + named competitor brands)
 * and recreates it. Keys ownership to the kristian@wander.com user, and points
 * that user's active sessions at the new org so the app is scoped on next load.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  adSpotTable,
  audienceTable,
  brandInspirationTable,
  brandTable,
  platformCampaignTable,
  channelTable,
  contentPostTable,
  campaignTable,
  memberTable,
  organizationTable,
  platformPostTable,
  type PostStats,
  seriesTable,
  sessionTable,
  userTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";

const OWNER_EMAIL = "kristian@wander.com";
const ORG_SLUG = "wander";
const COMPETITOR_SLUGS = ["airbnb", "vrbo", "outsite"];

const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

// Tag every seeded post/content row so `bun run db:unseed` can remove demo data
// without touching real synced rows (which insert with isSeed=false default).
const withSeed = <const T extends object>(
  rows: readonly T[],
): (T & { isSeed: true })[] => rows.map((r) => ({ ...r, isSeed: true }));

async function main() {
  // 1. Owner
  const owner = await db.query.userTable.findFirst({
    where: eq(userTable.email, OWNER_EMAIL),
  });
  if (!owner) {
    throw new Error(
      `No user with email ${OWNER_EMAIL}. Sign up first, then re-run the seed.`,
    );
  }
  console.log(`✓ owner: ${owner.email} (${owner.id})`);

  // 2. Wipe prior seed. Deleting the org cascades to owned brands → channels,
  //    posts, platform_posts, access, inspirations. Competitor brands (org null)
  //    are deleted explicitly.
  const existingOrg = await db.query.organizationTable.findFirst({
    where: eq(organizationTable.slug, ORG_SLUG),
  });
  if (existingOrg) {
    await db
      .delete(organizationTable)
      .where(eq(organizationTable.id, existingOrg.id));
  }
  await db.delete(brandTable).where(inArray(brandTable.slug, COMPETITOR_SLUGS));
  console.log("✓ cleared prior seed");

  // 3. Org + membership
  const orgId = createId("org");
  await db.insert(organizationTable).values({
    id: orgId,
    name: "Wander",
    slug: ORG_SLUG,
    plan: "pro",
  });
  await db.insert(memberTable).values({
    id: createId("mbr"),
    userId: owner.id,
    organizationId: orgId,
    role: "owner",
  });
  console.log(`✓ org: Wander (${orgId})`);

  // 4. Owned brands
  const wander = createId("brand");
  const wanderos = createId("brand");
  const founder = createId("brand");
  await db.insert(brandTable).values([
    {
      id: wander,
      organizationId: orgId,
      ownerId: owner.id,
      type: "company",
      name: "Wander",
      slug: "wander",
      tagline: "Luxury travel marketplace · find your happy place",
      website: "https://wander.com",
      followerCount: 214_000,
      brandFingerprint: {
        fingerprintText:
          "Aspirational, design-forward, calm luxury. Speaks to discerning travelers who want effortless, beautiful escapes.",
        voices: ["explorer", "lover"],
      },
    },
    {
      id: wanderos,
      organizationId: orgId,
      ownerId: owner.id,
      type: "company",
      name: "WanderOS",
      slug: "wanderos",
      tagline: "The operating system for property managers",
      website: "https://os.wander.com",
      followerCount: 32_000,
      brandFingerprint: {
        fingerprintText:
          "Pragmatic, operator-to-operator, quietly confident. Talks shop with property managers without fluff.",
        voices: ["sage", "ruler"],
      },
    },
    {
      id: founder,
      organizationId: orgId,
      ownerId: owner.id,
      type: "personal",
      name: "John A. Entwistle",
      slug: "john-entwistle",
      tagline: "Founder & CEO, Wander · personal brand",
      followerCount: 88_000,
      brandFingerprint: {
        fingerprintText:
          "Founder voice — candid, ambitious, building-in-public. First-person stories and strong opinions.",
        voices: ["hero", "challenger"],
      },
    },
  ]);
  console.log("✓ owned brands: Wander, WanderOS, John A. Entwistle");

  // 5. Channels (mix of connected / needs-attention)
  await db.insert(channelTable).values([
    // Wander — social
    {
      id: createId("chan"),
      brandId: wander,
      kind: "social",
      platform: "instagram",
      handle: "@wander",
      connectionStatus: "connected",
      followerCount: 142_000,
      profileUrl: "https://instagram.com/wander",
      manageUrl: "https://business.instagram.com",
    },
    {
      id: createId("chan"),
      brandId: wander,
      kind: "social",
      platform: "x",
      handle: "@wander",
      connectionStatus: "connected",
      followerCount: 38_000,
      profileUrl: "https://x.com/wander",
    },
    {
      id: createId("chan"),
      brandId: wander,
      kind: "social",
      platform: "tiktok",
      handle: "@wander",
      connectionStatus: "connected",
      followerCount: 21_000,
      profileUrl: "https://tiktok.com/@wander",
    },
    {
      id: createId("chan"),
      brandId: wander,
      kind: "social",
      platform: "linkedin",
      handle: "Wander",
      connectionStatus: "connected",
      profileUrl: "https://linkedin.com/company/wander",
    },
    {
      id: createId("chan"),
      brandId: wander,
      kind: "social",
      platform: "facebook",
      handle: "Wander",
      connectionStatus: "expired",
      profileUrl: "https://facebook.com/wander",
    },
    {
      id: createId("chan"),
      brandId: wander,
      kind: "social",
      platform: "youtube",
      handle: "@wander",
      connectionStatus: "connected",
      profileUrl: "https://youtube.com/@wander",
    },
    // Wander — ad
    {
      id: createId("chan"),
      brandId: wander,
      kind: "ad",
      platform: "meta_ads",
      handle: "Act 4471",
      connectionStatus: "connected",
      defaultProvider: "zernio",
      manageUrl: "https://adsmanager.facebook.com",
    },
    {
      id: createId("chan"),
      brandId: wander,
      kind: "ad",
      platform: "google_ads",
      handle: "882-44",
      connectionStatus: "error",
      manageUrl: "https://ads.google.com",
    },
    {
      id: createId("chan"),
      brandId: wander,
      kind: "ad",
      platform: "openai_ads",
      handle: "oai_beta",
      connectionStatus: "expired",
      manageUrl: "https://platform.openai.com",
    },
    // Wander — owned content surfaces
    {
      id: createId("chan"),
      brandId: wander,
      kind: "newsletter",
      platform: "newsletter",
      handle: "The Dispatch",
      connectionStatus: "connected",
      defaultProvider: "customerio",
      profileUrl: "https://wander.com/newsletter",
      manageUrl: "https://fly.customer.io",
    },
    {
      id: createId("chan"),
      brandId: wander,
      kind: "blog",
      platform: "blog",
      handle: "wander.com/blog",
      connectionStatus: "connected",
      defaultProvider: "native",
      profileUrl: "https://wander.com/blog",
      manageUrl: "https://wander.com/admin/blog",
    },
    // WanderOS
    {
      id: createId("chan"),
      brandId: wanderos,
      kind: "social",
      platform: "linkedin",
      handle: "WanderOS",
      connectionStatus: "connected",
    },
    {
      id: createId("chan"),
      brandId: wanderos,
      kind: "social",
      platform: "x",
      handle: "@wanderos",
      connectionStatus: "connected",
    },
    {
      id: createId("chan"),
      brandId: wanderos,
      kind: "ad",
      platform: "meta_ads",
      handle: "Act 2210",
      connectionStatus: "connected",
    },
    {
      id: createId("chan"),
      brandId: wanderos,
      kind: "newsletter",
      platform: "newsletter",
      handle: "Operator Notes",
      connectionStatus: "connected",
      defaultProvider: "customerio",
      profileUrl: "https://os.wander.com/newsletter",
      manageUrl: "https://fly.customer.io",
    },
    // Founder
    {
      id: createId("chan"),
      brandId: founder,
      kind: "social",
      platform: "x",
      handle: "@johnentwistle",
      connectionStatus: "connected",
      followerCount: 61_000,
    },
    {
      id: createId("chan"),
      brandId: founder,
      kind: "social",
      platform: "linkedin",
      handle: "John Entwistle",
      connectionStatus: "connected",
      followerCount: 27_000,
    },
  ]);
  console.log("✓ channels");

  // 6. Tracked competitor / inspiration brands (org null, scraped)
  const airbnb = createId("brand");
  const vrbo = createId("brand");
  const outsite = createId("brand");
  await db.insert(brandTable).values([
    {
      id: airbnb,
      type: "company",
      name: "Airbnb",
      slug: "airbnb",
      website: "https://airbnb.com",
    },
    {
      id: vrbo,
      type: "company",
      name: "Vrbo",
      slug: "vrbo",
      website: "https://vrbo.com",
    },
    {
      id: outsite,
      type: "company",
      name: "Outsite",
      slug: "outsite",
      website: "https://outsite.co",
    },
  ]);
  await db.insert(brandInspirationTable).values([
    {
      id: createId("insp"),
      brandId: wander,
      inspirationBrandId: airbnb,
      purpose: "competitor",
    },
    {
      id: createId("insp"),
      brandId: wanderos,
      inspirationBrandId: airbnb,
      purpose: "competitor",
    }, // dedup: ref by both
    {
      id: createId("insp"),
      brandId: wander,
      inspirationBrandId: vrbo,
      purpose: "competitor",
    },
    {
      id: createId("insp"),
      brandId: wander,
      inspirationBrandId: outsite,
      purpose: "inspiration",
    },
  ]);
  console.log("✓ tracked brands: Airbnb (×2), Vrbo, Outsite");

  // 7. Master content posts + their platform spots — a vibe seed translated from
  //    the design handoff's feed.jsx (organic only; ads land with the ad_spot domain).
  const wc = await db.query.channelTable.findMany({
    where: eq(channelTable.brandId, wander),
  });
  const wchan = (platform: string) =>
    wc.find((c) => c.platform === platform)?.id ?? null;
  const osc = await db.query.channelTable.findMany({
    where: eq(channelTable.brandId, wanderos),
  });
  const osLinkedin = osc.find((c) => c.platform === "linkedin")?.id ?? null;

  // Generic channel resolvers so generated content can target any brand.
  const fc = await db.query.channelTable.findMany({
    where: eq(channelTable.brandId, founder),
  });
  const channelsByBrand: Record<string, typeof wc> = {
    [wander]: wc,
    [wanderos]: osc,
    [founder]: fc,
  };
  const chan = (brandId: string, platform: string) =>
    channelsByBrand[brandId]?.find((c) => c.platform === platform)?.id ?? null;
  const handle = (brandId: string, platform: string) =>
    channelsByBrand[brandId]?.find((c) => c.platform === platform)?.handle ??
    null;
  const providerFor = (platform: string): "native" | "customerio" | "zernio" =>
    platform === "blog"
      ? "native"
      : platform === "newsletter"
        ? "customerio"
        : "zernio";

  // Date at a given day-offset + hour-of-day (for a believable timeline).
  const at = (day: number, hour: number) => {
    const d = daysFromNow(day);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  // A themed series grouping the work-from-a-stay ideas.
  const seriesSummer = createId("series");
  await db.insert(seriesTable).values([
    {
      id: seriesSummer,
      brandId: wander,
      name: "Summer of Remote Work",
      slug: "summer-of-remote-work",
      description:
        "Work-from-anywhere stays, coast to mountains, for summer 2026.",
      theme: "Remote work + travel",
      color: "#f59e0b",
      status: "active",
      startAt: at(-7, 0),
      endAt: at(45, 0),
    },
  ]);

  const cpCoast = createId("post");
  const cpOperator = createId("post");
  const cpSunset = createId("post");
  const cpSummer = createId("post");
  await db.insert(contentPostTable).values(
    withSeed([
      {
        id: cpCoast,
        brandId: wander,
        seriesId: seriesSummer,
        ownerId: owner.id,
        createdById: owner.id,
        title: "Best stays for working from the coast",
        pillar: "travel-guides",
        status: "published",
        origin: "human",
      },
      {
        id: cpOperator,
        brandId: wanderos,
        ownerId: owner.id,
        createdById: owner.id,
        title: "The host as operator",
        pillar: "for-hosts",
        status: "approved",
        origin: "human",
      },
      {
        id: cpSunset,
        brandId: wander,
        seriesId: seriesSummer,
        ownerId: owner.id,
        createdById: owner.id,
        title: "Topanga sunset · reel",
        pillar: "travel-inspiration",
        status: "scheduled",
        origin: "human",
      },
      {
        id: cpSummer,
        brandId: wander,
        seriesId: seriesSummer,
        ownerId: owner.id,
        createdById: owner.id,
        title: "June · Summer in 5 stays",
        pillar: "travel-inspiration",
        status: "scheduled",
        origin: "human",
      },
    ]),
  );

  await db.insert(platformPostTable).values(
    withSeed([
      // --- Wednesday (yesterday) — published ---
      {
        id: createId("pp"),
        brandId: wander,
        contentPostId: cpCoast,
        channelId: wchan("blog"),
        platform: "blog",
        username: "wander.com/blog",
        source: "owned",
        status: "published",
        origin: "human",
        provider: "native",
        text: "The case for the coast: two fiber backhauls, Starlink fallback, and a desk that faces the water.",
        stats: { views: 4210 },
        publishedAt: at(-1, 8),
      },
      {
        id: createId("pp"),
        brandId: wander,
        contentPostId: cpCoast,
        channelId: wchan("instagram"),
        platform: "instagram",
        username: "@wander",
        source: "owned",
        status: "published",
        origin: "human",
        provider: "zernio",
        text: "Your next office has an ocean view. 5 coastal stays built for deep work →",
        stats: { likes: 2140, comments: 48 },
        publishedAt: at(-1, 11),
      },
      {
        id: createId("pp"),
        brandId: wander,
        contentPostId: cpCoast,
        channelId: wchan("x"),
        platform: "x",
        username: "@wander",
        source: "owned",
        status: "published",
        origin: "human",
        provider: "zernio",
        text: "We tested the wifi at 5 coastal stays so you don't have to. A thread 🧵",
        stats: { views: 54000 },
        publishedAt: at(-1, 14),
      },
      // --- Thursday (today) ---
      {
        id: createId("pp"),
        brandId: wander,
        contentPostId: cpCoast,
        channelId: wchan("linkedin"),
        platform: "linkedin",
        username: "Wander",
        source: "owned",
        status: "published",
        origin: "human",
        provider: "zernio",
        text: "Remote work didn't kill the office — it moved it. What we learned building stays for anywhere.",
        stats: { likes: 420 },
        publishedAt: at(0, 9),
      },
      {
        id: createId("pp"),
        brandId: wanderos,
        contentPostId: cpOperator,
        channelId: osLinkedin,
        platform: "linkedin",
        username: "WanderOS",
        source: "owned",
        status: "approved",
        origin: "human",
        provider: "zernio",
        text: "Great stays aren't luck. They're operations. A look at the invisible work behind a great stay.",
        scheduledAt: at(0, 15),
      },
      // --- Friday — scheduled ---
      {
        id: createId("pp"),
        brandId: wander,
        contentPostId: cpSunset,
        channelId: wchan("instagram"),
        platform: "instagram",
        username: "@wander",
        source: "owned",
        status: "scheduled",
        origin: "human",
        provider: "zernio",
        text: "Sunset at Topanga. Tap to feel the light. →",
        scheduledAt: at(1, 11),
      },
      {
        id: createId("pp"),
        brandId: wander,
        contentPostId: cpSunset,
        channelId: wchan("tiktok"),
        platform: "tiktok",
        username: "@wander",
        source: "owned",
        status: "scheduled",
        origin: "human",
        provider: "zernio",
        text: "POV: your home office for the week",
        scheduledAt: at(1, 16),
      },
      // --- Sunday — scheduled ---
      {
        id: createId("pp"),
        brandId: wander,
        contentPostId: cpSummer,
        channelId: wchan("newsletter"),
        platform: "newsletter",
        username: "The Dispatch",
        source: "owned",
        status: "scheduled",
        origin: "human",
        provider: "customerio",
        text: "Five places to spend your summer working — and one host story you'll want to forward.",
        scheduledAt: at(3, 8),
      },
      {
        id: createId("pp"),
        brandId: wander,
        contentPostId: cpSummer,
        channelId: wchan("instagram"),
        platform: "instagram",
        username: "@wander",
        source: "owned",
        status: "scheduled",
        origin: "human",
        provider: "zernio",
        text: "Stay #1 · Topanga →",
        scheduledAt: at(3, 17),
      },
      // --- a scraped competitor post (no channel / no master post) ---
      {
        id: createId("pp"),
        brandId: airbnb,
        platform: "instagram",
        username: "@airbnb",
        source: "scraped",
        status: "published",
        text: "Find a place to stay anywhere.",
        stats: { likes: 18400, comments: 210 },
        publishedAt: at(-2, 10),
        scrapedAt: daysFromNow(0),
      },
    ]),
  );
  console.log("✓ content posts + platform spots (vibe feed)");

  // 7c. Bulk vibe content. Generated from compact templates so volume scales by
  //     editing the arrays. Seeded PRNG keeps re-seeds stable for screenshots.
  let _rng = 0x2f6e2b1;
  const rnd = () => {
    _rng = (_rng * 1664525 + 1013904223) >>> 0;
    return _rng / 0xffffffff;
  };
  const between = (lo: number, hi: number) =>
    Math.floor(lo + rnd() * (hi - lo + 1));
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  const statusFor = (
    day: number,
  ): "published" | "scheduled" | "approved" | "draft" =>
    day <= 0
      ? "published"
      : day <= 2
        ? "scheduled"
        : day <= 4
          ? "approved"
          : "draft";

  // A founder series for the build-in-public posts.
  const seriesBuild = createId("series");
  await db.insert(seriesTable).values([
    {
      id: seriesBuild,
      brandId: founder,
      name: "Build in Public",
      slug: "build-in-public",
      description: "Founder notes on building Wander and WanderOS.",
      theme: "Founder POV",
      color: "#38bdf8",
      status: "active",
      startAt: at(-30, 0),
    },
  ]);

  type Idea = {
    brandId: string;
    title: string;
    pillar: string | null;
    seriesId?: string;
    day: number;
    renderings: { platform: string; text: string; stats?: PostStats }[];
  };

  const IDEAS: Idea[] = [
    // --- Wander ---
    {
      brandId: wander,
      title: "Desert nights in Joshua Tree",
      pillar: "travel-inspiration",
      seriesId: seriesSummer,
      day: -18,
      renderings: [
        {
          platform: "instagram",
          text: "The desert doesn't whisper. It hums. Three stays under the Joshua Tree sky →",
          stats: { likes: 3120, comments: 74, saves: 410 },
        },
        {
          platform: "tiktok",
          text: "POV: you traded notifications for stars ✨",
          stats: { views: 88000, likes: 9400 },
        },
        {
          platform: "x",
          text: "We mapped the darkest-sky stays within 3 hours of LA. Thread 🧵",
          stats: { views: 41000, likes: 510 },
        },
      ],
    },
    {
      brandId: wander,
      title: "The 48-hour Big Sur reset",
      pillar: "travel-guides",
      seriesId: seriesSummer,
      day: -14,
      renderings: [
        {
          platform: "blog",
          text: "A 48-hour Big Sur itinerary built around fog, fast wifi, and one very good cliffside desk.",
          stats: { views: 6700 },
        },
        {
          platform: "instagram",
          text: "Two days. One cliff. Zero meetings you couldn't take. →",
          stats: { likes: 2780, comments: 51 },
        },
        {
          platform: "newsletter",
          text: "This week: the 48-hour Big Sur reset, plus a host who left tech to run three stays.",
          stats: { views: 14200, clicks: 1180 },
        },
      ],
    },
    {
      brandId: wander,
      title: "Why our hosts leave a handwritten note",
      pillar: "wander-experience",
      day: -10,
      renderings: [
        {
          platform: "instagram",
          text: "Every stay starts with a note in someone's handwriting. Here's why.",
          stats: { likes: 4015, comments: 132, saves: 690 },
        },
        {
          platform: "linkedin",
          text: "Hospitality is a thousand small decisions. The handwritten note is our favorite one.",
          stats: { likes: 880, comments: 40 },
        },
      ],
    },
    {
      brandId: wander,
      title: "Member story: a month in Tulum",
      pillar: "customer-stories",
      day: -6,
      renderings: [
        {
          platform: "instagram",
          text: "“I came for a week. I rebooked for a month.” — Priya, on working from Tulum.",
          stats: { likes: 5210, comments: 96 },
        },
        {
          platform: "tiktok",
          text: "She ran her startup from a hammock for 30 days. Here's how it went.",
          stats: { views: 124000, likes: 15200 },
        },
      ],
    },
    {
      brandId: wander,
      title: "Instant book is live on monthly stays",
      pillar: "announcements",
      day: -3,
      renderings: [
        {
          platform: "x",
          text: "Monthly stays now support instant book. No more waiting on a host to confirm your month. Live today.",
          stats: { views: 62000, likes: 940 },
        },
        {
          platform: "linkedin",
          text: "We shipped instant book for 30-day+ stays. Booking a month should feel as easy as booking a night.",
          stats: { likes: 1210, comments: 58 },
        },
      ],
    },
    {
      brandId: wander,
      title: "Aspen first-snow watch",
      pillar: "travel-inspiration",
      day: 2,
      renderings: [
        {
          platform: "instagram",
          text: "First snow is coming. Be in the mountains when it lands. →",
        },
        {
          platform: "tiktok",
          text: "POV: you woke up to the season's first snow",
        },
      ],
    },
    {
      brandId: wander,
      title: "Lake Tahoe long-weekend guide",
      pillar: "travel-guides",
      seriesId: seriesSummer,
      day: 4,
      renderings: [
        {
          platform: "blog",
          text: "The Lake Tahoe long-weekend guide: three stays, two trailheads, and the best desk-with-a-view.",
        },
        {
          platform: "newsletter",
          text: "Pack for the lake: our Tahoe long-weekend guide is live.",
        },
      ],
    },
    // --- WanderOS ---
    {
      brandId: wanderos,
      title: "5 ops mistakes new hosts make",
      pillar: "for-hosts",
      day: -12,
      renderings: [
        {
          platform: "linkedin",
          text: "Five operational mistakes we see new hosts make — and the systems that fix them.",
          stats: { likes: 1420, comments: 88 },
        },
        {
          platform: "x",
          text: "Most host problems aren't guest problems. They're ops problems. 5 we see constantly 🧵",
          stats: { views: 33000, likes: 410 },
        },
      ],
    },
    {
      brandId: wanderos,
      title: "Changelog: smart-lock sync",
      pillar: "wanderos",
      day: -5,
      renderings: [
        {
          platform: "linkedin",
          text: "Changelog: smart-lock sync now updates codes the moment a reservation changes. No more stale PINs.",
          stats: { likes: 760, comments: 22 },
        },
        {
          platform: "newsletter",
          text: "Operator Notes: smart-lock sync ships, plus shoulder-season pricing tips.",
        },
      ],
    },
    {
      brandId: wanderos,
      title: "Webinar: pricing for shoulder season",
      pillar: "for-hosts",
      day: 3,
      renderings: [
        {
          platform: "linkedin",
          text: "Live next week: pricing your stays through shoulder season without the race to the bottom. Register →",
        },
        {
          platform: "x",
          text: "Free webinar: shoulder-season pricing that protects your margin. Next Thursday.",
        },
      ],
    },
    // --- Founder (John A. Entwistle) ---
    {
      brandId: founder,
      title: "What I learned scaling to 200 stays",
      pillar: null,
      seriesId: seriesBuild,
      day: -9,
      renderings: [
        {
          platform: "x",
          text: "We crossed 200 stays this month. The hardest part wasn't supply — it was keeping the bar absurdly high. What I learned 🧵",
          stats: { views: 210000, likes: 4800 },
        },
        {
          platform: "linkedin",
          text: "200 stays in. A few honest lessons on scaling quality without diluting it.",
          stats: { likes: 3100, comments: 210 },
        },
      ],
    },
    {
      brandId: founder,
      title: "Hiring is the product",
      pillar: null,
      seriesId: seriesBuild,
      day: -4,
      renderings: [
        {
          platform: "x",
          text: "Early on, hiring IS the product. Every person is a feature you can't roll back. How we think about it.",
          stats: { views: 98000, likes: 2200 },
        },
        {
          platform: "linkedin",
          text: "A thing I believe more every year: in an early company, hiring is the product.",
          stats: { likes: 1840, comments: 96 },
        },
      ],
    },
    {
      brandId: founder,
      title: "Building WanderOS in public: month 3",
      pillar: null,
      seriesId: seriesBuild,
      day: 1,
      renderings: [
        {
          platform: "x",
          text: "Month 3 of building WanderOS in public. Revenue, churn, the feature we cut, and what's next ↓",
        },
        {
          platform: "linkedin",
          text: "Building WanderOS in public — month 3 numbers and the bet we're making next quarter.",
        },
      ],
    },
    // --- More Facebook + X coverage (Wander / WanderOS / Founder) ---
    {
      brandId: wander,
      title: "Weekend drop: Joshua Tree dome",
      pillar: "travel-inspiration",
      day: -16,
      renderings: [
        {
          platform: "facebook",
          text: "Open this weekend: a glass dome under the Joshua Tree sky. Tag who you'd bring.",
          stats: { likes: 1280, comments: 64, shares: 90 },
        },
        {
          platform: "x",
          text: "Glass dome. Joshua Tree. This weekend only. 🌵",
          stats: { views: 38000, likes: 460 },
        },
      ],
    },
    {
      brandId: wander,
      title: "Family stays Q&A",
      pillar: "customer-stories",
      day: -11,
      renderings: [
        {
          platform: "facebook",
          text: "We asked: what makes a stay actually work with kids? 400 of you answered. The 5 things that came up most →",
          stats: { likes: 2210, comments: 318, shares: 142 },
        },
        {
          platform: "x",
          text: "The 5 things parents said make or break a family stay 🧵",
          stats: { views: 52000, likes: 720 },
        },
      ],
    },
    {
      brandId: wander,
      title: "Flash: 3 nights, ocean view",
      pillar: "announcements",
      day: -2,
      renderings: [
        {
          platform: "facebook",
          text: "Flash: 3 nights, ocean view, instant book. Gone by Sunday.",
          stats: { likes: 1640, comments: 88, shares: 210 },
        },
        {
          platform: "x",
          text: "3 nights. Ocean view. Instant book. Gone by Sunday. ⏳",
          stats: { views: 71000, likes: 1010 },
        },
        {
          platform: "instagram",
          text: "Swipe for the view you'd wake up to →",
          stats: { likes: 4900, comments: 73 },
        },
      ],
    },
    {
      brandId: wander,
      title: "Poll: mountains or coast?",
      pillar: "travel-inspiration",
      day: 2,
      renderings: [
        {
          platform: "facebook",
          text: "Settle it for us: mountains or coast for your next remote-work week? 🏔️🌊",
        },
        {
          platform: "x",
          text: "Mountains or coast for your next work-from-anywhere week? Reply with one emoji.",
        },
      ],
    },
    {
      brandId: wanderos,
      title: "Operator AMA recap",
      pillar: "for-hosts",
      day: -7,
      renderings: [
        {
          platform: "x",
          text: "We ran an operator AMA. The most-asked question? Dynamic pricing without the race to the bottom. Recap 🧵",
          stats: { views: 41000, likes: 530 },
        },
        {
          platform: "facebook",
          text: "Operator AMA recap: pricing, smart locks, and the one ops metric we'd never skip.",
          stats: { likes: 640, comments: 51, shares: 38 },
        },
      ],
    },
    {
      brandId: founder,
      title: "Why we don't discount",
      pillar: null,
      seriesId: seriesBuild,
      day: -2,
      renderings: [
        {
          platform: "x",
          text: "We don't discount. Here's the reasoning — and what we do instead to earn the booking.",
          stats: { views: 120000, likes: 2600 },
        },
      ],
    },
    // --- Fill out the near-future days (offsets +2 / +3 / +4) ---
    {
      brandId: wander,
      title: "Desert stargazing checklist",
      pillar: "travel-inspiration",
      day: 2,
      renderings: [
        {
          platform: "instagram",
          text: "Pack for the dark sky: 6 things that make a desert night unforgettable →",
        },
        {
          platform: "facebook",
          text: "Heading to the desert? Here's our stargazing checklist — save it for later. ✨",
        },
        {
          platform: "x",
          text: "Desert stargazing checklist, in one tweet: red light, layers, no moon, a flask of something warm. 🌌",
        },
      ],
    },
    {
      brandId: wanderos,
      title: "Office hours: ask us anything",
      pillar: "for-hosts",
      day: 2,
      renderings: [
        {
          platform: "linkedin",
          text: "Operator office hours this Thursday — bring your pricing, ops, and channel questions. Free.",
        },
        {
          platform: "x",
          text: "Hosts: free office hours Thursday. Pricing, smart locks, channel mix — ask us anything.",
        },
      ],
    },
    {
      brandId: wander,
      title: "Big Sur fog report",
      pillar: "travel-guides",
      day: 3,
      renderings: [
        {
          platform: "instagram",
          text: "The fog rolls in by 4pm and it's the best part. Big Sur stays with a view of it →",
        },
        {
          platform: "x",
          text: "Big Sur fog report: rolling in early this week. The decks are calling. 🌫️",
        },
        {
          platform: "facebook",
          text: "There's a specific magic to Big Sur fog. Three stays built to watch it arrive.",
        },
      ],
    },
    {
      brandId: wander,
      title: "Host spotlight: the lighthouse keeper",
      pillar: "customer-stories",
      day: 3,
      renderings: [
        {
          platform: "instagram",
          text: "He restored a lighthouse keeper's cottage by hand. Now you can stay in it. →",
        },
        {
          platform: "blog",
          text: "Host spotlight: how a former engineer restored a lighthouse keeper's cottage into one of our most-booked coastal stays.",
        },
      ],
    },
    {
      brandId: founder,
      title: "The one metric we obsess over",
      pillar: null,
      seriesId: seriesBuild,
      day: 3,
      renderings: [
        {
          platform: "x",
          text: "Everyone asks about GMV. The metric we actually obsess over is rebook rate. Here's why it's the only one that compounds.",
        },
        {
          platform: "linkedin",
          text: "If I could only watch one number, it'd be rebook rate. A short note on why it's the truest signal of a great stay.",
        },
      ],
    },
    {
      brandId: wanderos,
      title: "New: occupancy forecast",
      pillar: "wanderos",
      day: 4,
      renderings: [
        {
          platform: "linkedin",
          text: "Shipping this week: occupancy forecast. See your next 90 days at a glance and price into the gaps.",
        },
        {
          platform: "x",
          text: "New in WanderOS: a 90-day occupancy forecast. Stop pricing blind. 📈",
        },
      ],
    },
    {
      brandId: wander,
      title: "Weekend in Sedona",
      pillar: "travel-inspiration",
      day: 4,
      renderings: [
        {
          platform: "instagram",
          text: "Red rocks, big skies, and a desk that faces all of it. A weekend in Sedona →",
        },
        {
          platform: "facebook",
          text: "Sedona in 48 hours: where to stay, when to hike, and the best sunset spot we've found.",
        },
      ],
    },
  ];

  const bulkContent: (typeof contentPostTable.$inferInsert)[] = [];
  const bulkPosts: (typeof platformPostTable.$inferInsert)[] = [];
  for (const idea of IDEAS) {
    const cid = createId("post");
    const status = statusFor(idea.day);
    bulkContent.push({
      id: cid,
      brandId: idea.brandId,
      seriesId: idea.seriesId ?? null,
      ownerId: owner.id,
      createdById: owner.id,
      title: idea.title,
      pillar: idea.pillar,
      status,
      origin: "human",
    });
    idea.renderings.forEach((r, i) => {
      const when = at(idea.day, 8 + i * 3 + between(0, 1));
      const published = idea.day <= 0;
      bulkPosts.push({
        id: createId("pp"),
        brandId: idea.brandId,
        contentPostId: cid,
        channelId: chan(idea.brandId, r.platform),
        platform:
          r.platform as (typeof platformPostTable.$inferInsert)["platform"],
        username: handle(idea.brandId, r.platform),
        source: "owned",
        status,
        origin: "human",
        provider: providerFor(r.platform),
        text: r.text,
        stats: published ? r.stats : undefined,
        publishedAt: published ? when : undefined,
        scheduledAt: published ? undefined : when,
      });
    });
  }
  await db.insert(contentPostTable).values(withSeed(bulkContent));
  await db.insert(platformPostTable).values(withSeed(bulkPosts));
  console.log(
    `✓ bulk owned content (${bulkContent.length} ideas, ${bulkPosts.length} spots)`,
  );

  // Scraped competitor posts — powers the cross-competitor feed + per-brand
  // filtering. No channel/content parent; source = scraped.
  const COMPETITORS: {
    brandId: string;
    handle: string;
    platforms: string[];
    count: number;
    scale: number;
    captions: string[];
  }[] = [
    {
      brandId: airbnb,
      handle: "@airbnb",
      platforms: ["instagram", "x", "tiktok", "facebook"],
      count: 14,
      scale: 1,
      captions: [
        "Find a place to stay anywhere.",
        "Live there. Even if it's just for a weekend.",
        "Icons: stays you have to see to believe.",
        "The whole place to yourself. The whole weekend ahead of you.",
        "Get an apartment. Get a routine. Get going.",
        "Hosts open doors. You walk through them.",
      ],
    },
    {
      brandId: vrbo,
      handle: "@vrbo",
      platforms: ["instagram", "facebook", "x"],
      count: 10,
      scale: 0.55,
      captions: [
        "The whole house. The whole family. No compromises.",
        "Vacation homes for the whole group.",
        "More space for everyone you love.",
        "Beach houses, lake houses — the house that becomes the trip.",
        "One big house beats five small rooms.",
      ],
    },
    {
      brandId: outsite,
      handle: "@outsite",
      platforms: ["instagram", "linkedin", "x"],
      count: 8,
      scale: 0.18,
      captions: [
        "Live and work from the world's best places.",
        "Coliving for people who don't sit still.",
        "Wifi, community, and an ocean out front.",
        "Work from anywhere. Belong everywhere.",
      ],
    },
  ];

  const scrapedPosts: (typeof platformPostTable.$inferInsert)[] = [];
  for (const c of COMPETITORS) {
    for (let i = 0; i < c.count; i++) {
      const likes = Math.floor(between(600, 26000) * c.scale);
      scrapedPosts.push({
        id: createId("pp"),
        brandId: c.brandId,
        platform: pick(
          c.platforms,
        ) as (typeof platformPostTable.$inferInsert)["platform"],
        username: c.handle,
        source: "scraped",
        status: "published",
        text: pick(c.captions),
        stats: { likes, comments: Math.floor(likes * 0.03), views: likes * 8 },
        publishedAt: at(-between(1, 21), between(8, 20)),
        scrapedAt: daysFromNow(0),
      });
    }
  }
  await db.insert(platformPostTable).values(withSeed(scrapedPosts));
  console.log(`✓ scraped competitor posts (${scrapedPosts.length})`);

  // 7b. Ad initiatives → per-channel campaigns → ad spots, + audiences.
  // Initiative = the CMO's goal-driven push; `campaign` rows are the per-channel
  // implementations (verified against the initiative's targetChannels); ad_spots
  // are the individual creatives under a campaign.
  const metaCh = wchan("meta_ads")!;
  const googleCh = wchan("google_ads")!;
  const openaiCh = wchan("openai_ads")!;
  const osMetaCh = osc.find((c) => c.platform === "meta_ads")?.id ?? metaCh;
  const adImg = (s: string) => `https://picsum.photos/seed/${s}/640/480`;

  const initSupply = createId("init");
  const initDemand = createId("init");
  const initBrand = createId("init");
  const initSaas = createId("init");
  await db.insert(campaignTable).values([
    {
      id: initSupply,
      brandId: wander,
      name: "Supply — hosts to /list",
      slug: "supply-list",
      goal: "supply",
      landingUrl: "https://wander.com/list",
      color: "#34d399",
      status: "active",
      targetChannels: ["meta_ads", "google_ads"],
      budget: 30000,
      startAt: daysFromNow(-10),
    },
    {
      id: initDemand,
      brandId: wander,
      name: "Demand — bookings",
      slug: "demand-bookings",
      goal: "demand",
      landingUrl: "https://wander.com",
      color: "#38bdf8",
      status: "active",
      targetChannels: ["meta_ads", "google_ads", "openai_ads"],
      budget: 60000,
      startAt: daysFromNow(-25),
    },
    {
      id: initBrand,
      brandId: wander,
      name: "Brand — always-on",
      slug: "brand-awareness",
      goal: "brand",
      landingUrl: "https://wander.com",
      color: "#a78bfa",
      status: "active",
      targetChannels: ["meta_ads"],
      budget: 15000,
      startAt: daysFromNow(-60),
    },
    // SaaS targets Meta + Google, but only Meta is implemented → verify gap.
    {
      id: initSaas,
      brandId: wanderos,
      name: "SaaS — signups to /os",
      slug: "saas-os",
      goal: "saas",
      landingUrl: "https://os.wander.com",
      color: "#f59e0b",
      status: "active",
      targetChannels: ["meta_ads", "google_ads"],
      budget: 30000,
      startAt: daysFromNow(-18),
    },
  ]);

  // Per-channel campaigns. A few ids captured for ad spots.
  const campCoastal = createId("camp");
  const campBecomeHost = createId("camp");
  const campOperator = createId("camp");
  await db.insert(platformCampaignTable).values([
    // --- Supply (/list) ---
    {
      id: campBecomeHost,
      campaignId: initSupply,
      brandId: wander,
      channelId: metaCh,
      platform: "meta_ads",
      name: "Become a host — Meta",
      status: "live",
      objective: "leads",
      startAt: daysFromNow(-10),
      budget: 16000,
      spend: 5200,
      adSpots: 3,
      manageUrl: "https://adsmanager.facebook.com",
    },
    {
      id: createId("camp"),
      campaignId: initSupply,
      brandId: wander,
      channelId: googleCh,
      platform: "google_ads",
      name: "Host acquisition — Search",
      status: "live",
      objective: "leads",
      startAt: daysFromNow(-8),
      budget: 14000,
      spend: 4100,
      adSpots: 4,
      manageUrl: "https://ads.google.com",
    },
    // --- Demand (bookings) ---
    {
      id: campCoastal,
      campaignId: initDemand,
      brandId: wander,
      channelId: metaCh,
      platform: "meta_ads",
      name: "Coastal CA — Summer",
      status: "live",
      objective: "conversions",
      startAt: at(-1, 0),
      endAt: daysFromNow(32),
      budget: 40000,
      spend: 3600,
      adSpots: 4,
      manageUrl: "https://adsmanager.facebook.com",
    },
    {
      id: createId("camp"),
      campaignId: initDemand,
      brandId: wander,
      channelId: metaCh,
      platform: "meta_ads",
      name: "Summer retargeting",
      status: "scheduled",
      objective: "conversions",
      startAt: daysFromNow(7),
      endAt: daysFromNow(37),
      budget: 15000,
      spend: 0,
      adSpots: 1,
      manageUrl: "https://adsmanager.facebook.com",
    },
    {
      id: createId("camp"),
      campaignId: initDemand,
      brandId: wander,
      channelId: googleCh,
      platform: "google_ads",
      name: "Monthly stays — Search",
      status: "live",
      objective: "leads",
      startAt: daysFromNow(-20),
      budget: 12000,
      spend: 880,
      adSpots: 3,
      manageUrl: "https://ads.google.com",
    },
    {
      id: createId("camp"),
      campaignId: initDemand,
      brandId: wander,
      channelId: googleCh,
      platform: "google_ads",
      name: "Competitor terms",
      status: "paused",
      objective: "leads",
      startAt: daysFromNow(-30),
      endAt: daysFromNow(-3),
      budget: 5000,
      spend: 4760,
      adSpots: 6,
      manageUrl: "https://ads.google.com",
    },
    {
      id: createId("camp"),
      campaignId: initDemand,
      brandId: wander,
      channelId: openaiCh,
      platform: "openai_ads",
      name: "Luxury Travel — Clicks",
      status: "live",
      objective: "clicks",
      startAt: daysFromNow(-12),
      budget: 2250,
      spend: 0,
      adSpots: 4,
      manageUrl: "https://platform.openai.com",
    },
    {
      id: createId("camp"),
      campaignId: initDemand,
      brandId: wander,
      channelId: openaiCh,
      platform: "openai_ads",
      name: "Remote-work intent — Test",
      status: "scheduled",
      objective: "clicks",
      startAt: daysFromNow(5),
      budget: 1500,
      spend: 0,
      adSpots: 2,
      manageUrl: "https://platform.openai.com",
    },
    // --- Brand ---
    {
      id: createId("camp"),
      campaignId: initBrand,
      brandId: wander,
      channelId: metaCh,
      platform: "meta_ads",
      name: "Joshua Tree — Awareness",
      status: "live",
      objective: "awareness",
      startAt: daysFromNow(-9),
      endAt: daysFromNow(12),
      budget: 9000,
      spend: 4100,
      adSpots: 3,
      manageUrl: "https://adsmanager.facebook.com",
    },
    {
      id: createId("camp"),
      campaignId: initBrand,
      brandId: wander,
      channelId: metaCh,
      platform: "meta_ads",
      name: "Brand — Always-on",
      status: "live",
      objective: "reach",
      startAt: daysFromNow(-60),
      budget: 6000,
      spend: 5200,
      adSpots: 2,
      manageUrl: "https://adsmanager.facebook.com",
    },
    // --- SaaS (/os) ---
    {
      id: campOperator,
      campaignId: initSaas,
      brandId: wanderos,
      channelId: osMetaCh,
      platform: "meta_ads",
      name: "Operator acquisition",
      status: "live",
      objective: "leads",
      startAt: daysFromNow(-18),
      budget: 18000,
      spend: 7400,
      adSpots: 5,
      manageUrl: "https://adsmanager.facebook.com",
    },
    {
      id: createId("camp"),
      campaignId: initSaas,
      brandId: wanderos,
      channelId: osMetaCh,
      platform: "meta_ads",
      name: "Free-trial retargeting",
      status: "scheduled",
      objective: "conversions",
      startAt: daysFromNow(4),
      endAt: daysFromNow(34),
      budget: 8000,
      spend: 0,
      adSpots: 2,
      manageUrl: "https://adsmanager.facebook.com",
    },
    {
      id: createId("camp"),
      campaignId: initSaas,
      brandId: wanderos,
      channelId: osMetaCh,
      platform: "meta_ads",
      name: "Webinar signups",
      status: "ended",
      objective: "leads",
      startAt: daysFromNow(-45),
      endAt: daysFromNow(-15),
      budget: 4000,
      spend: 3900,
      adSpots: 3,
      manageUrl: "https://adsmanager.facebook.com",
    },
  ]);

  // Ad spots (creatives) under a few campaigns.
  const spot = (
    platformCampaignId: string,
    channelId: string,
    spotBrandId: string,
    platform: "meta_ads" | "google_ads" | "openai_ads",
    i: number,
    body: string,
    link: string,
    status: string,
    stats: { spend: number; impressions: number; clicks: number; ctr: number },
  ) => ({
    id: createId("ad"),
    platformCampaignId,
    channelId,
    brandId: spotBrandId,
    platform,
    name: body.length > 30 ? `${body.slice(0, 30)}…` : body,
    status,
    adSetName: "Prospecting · US",
    media: [{ url: adImg(`ad-${platformCampaignId}-${i}`), type: "image" as const }],
    body,
    linkUrl: link,
    thumbnailUrl: adImg(`ad-${platformCampaignId}-${i}`),
    platformObjective: "OUTCOME_LEADS",
    optimizationGoal: "LEAD_GENERATION",
    bidStrategy: "LOWEST_COST",
    stats,
    manageUrl: "https://adsmanager.facebook.com",
  });
  await db
    .insert(adSpotTable)
    .values([
      spot(
        campBecomeHost,
        metaCh,
        wander,
        "meta_ads",
        1,
        "Turn your place into income. List on Wander.",
        "https://wander.com/list",
        "active",
        { spend: 2100, impressions: 142000, clicks: 3100, ctr: 2.2 },
      ),
      spot(
        campBecomeHost,
        metaCh,
        wander,
        "meta_ads",
        2,
        "Hosts earn more on Wander. Here's why.",
        "https://wander.com/list",
        "active",
        { spend: 1800, impressions: 121000, clicks: 2400, ctr: 1.9 },
      ),
      spot(
        campBecomeHost,
        metaCh,
        wander,
        "meta_ads",
        3,
        "From spare home to standout stay.",
        "https://wander.com/list",
        "paused",
        { spend: 1300, impressions: 88000, clicks: 1500, ctr: 1.7 },
      ),
      spot(
        campCoastal,
        metaCh,
        wander,
        "meta_ads",
        1,
        "Your next office has an ocean view.",
        "https://wander.com",
        "active",
        { spend: 2000, impressions: 210000, clicks: 4200, ctr: 2.0 },
      ),
      spot(
        campCoastal,
        metaCh,
        wander,
        "meta_ads",
        2,
        "5 coastal stays built for deep work.",
        "https://wander.com",
        "active",
        { spend: 1600, impressions: 168000, clicks: 3000, ctr: 1.8 },
      ),
      spot(
        campOperator,
        osMetaCh,
        wanderos,
        "meta_ads",
        1,
        "Run your stays like an operator, not a hobbyist.",
        "https://os.wander.com",
        "active",
        { spend: 3900, impressions: 96000, clicks: 1800, ctr: 1.9 },
      ),
      spot(
        campOperator,
        osMetaCh,
        wanderos,
        "meta_ads",
        2,
        "Smart locks, pricing, ops — one OS.",
        "https://os.wander.com",
        "active",
        { spend: 2400, impressions: 71000, clicks: 1200, ctr: 1.7 },
      ),
    ]);
  // "CA Remote Workers" exists on both Meta + Google → two rows, deduped by name in the UI.
  await db.insert(audienceTable).values([
    {
      id: createId("aud"),
      brandId: wander,
      channelId: metaCh,
      name: "CA Remote Workers · 28–45",
      type: "segment",
      sizeLabel: "~1.2M",
    },
    {
      id: createId("aud"),
      brandId: wander,
      channelId: googleCh,
      name: "CA Remote Workers · 28–45",
      type: "segment",
      sizeLabel: "~1.2M",
    },
    {
      id: createId("aud"),
      brandId: wander,
      channelId: googleCh,
      name: "Monthly-stay search intent",
      type: "keyword",
      sizeLabel: "~40K/mo",
    },
    {
      id: createId("aud"),
      brandId: wander,
      channelId: openaiCh,
      name: "Luxury Travel Audience",
      type: "intent",
      sizeLabel: "high-income · 30–65",
    },
    {
      id: createId("aud"),
      brandId: wander,
      channelId: metaCh,
      name: "Lookalike · past bookers",
      type: "lookalike",
      sizeLabel: "~2.1M",
    },
    {
      id: createId("aud"),
      brandId: wanderos,
      channelId: osMetaCh,
      name: "STR operators · 5+ units",
      type: "segment",
      sizeLabel: "~320K",
    },
    {
      id: createId("aud"),
      brandId: wanderos,
      channelId: osMetaCh,
      name: "Lookalike · trial signups",
      type: "lookalike",
      sizeLabel: "~1.8M",
    },
    {
      id: createId("aud"),
      brandId: wanderos,
      channelId: osMetaCh,
      name: "Property-management intent",
      type: "intent",
      sizeLabel: "~90K/mo",
    },
  ]);
  console.log("✓ ad campaigns + audiences");

  // 7d. Media backfill — give every seed post a placeholder image so the feed
  //     reads as visual. The feed uses a plain <img>, so any URL works (no
  //     next/image remotePatterns needed). Swap for real media on ingestion.
  const seedBrandIds = [wander, wanderos, founder, airbnb, vrbo, outsite];
  const needMedia = await db.query.platformPostTable.findMany({
    where: and(
      inArray(platformPostTable.brandId, seedBrandIds),
      isNull(platformPostTable.media),
    ),
  });
  for (const p of needMedia) {
    await db
      .update(platformPostTable)
      .set({
        media: [
          { url: `https://picsum.photos/seed/${p.id}/640/480`, type: "image" },
        ],
      })
      .where(eq(platformPostTable.id, p.id));
  }
  console.log(`✓ media backfilled (${needMedia.length})`);

  // 8. Point the owner's active sessions at the new org so the app is scoped.
  await db
    .update(sessionTable)
    .set({ activeOrganizationId: orgId })
    .where(eq(sessionTable.userId, owner.id));
  console.log("✓ active org set on owner sessions");

  console.log("\n🌱 Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
