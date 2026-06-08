import "server-only";

import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandInspirationTable,
  brandTable,
  campaignTable,
  initiativeTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { displayPoster } from "@/lib/utils/media";

/**
 * Shared data loader for the feed-v2 / feed-v3 prototypes. Lives in a private
 * (`_`-prefixed) folder so it never becomes a route. Pulls owned brands AND the
 * competitor/inspiration brands tracked from them, plus every brand's platform
 * posts. Delete this folder once we consolidate the winning design.
 */

export type ProtoRole = "owned" | "competitor" | "inspiration";

export type ProtoBrand = {
  id: string;
  name: string;
  logo: string | null;
  role: ProtoRole;
};

export type ProtoEntry = {
  id: string;
  brandId: string;
  platform: string;
  handle: string | null;
  text: string | null;
  status: string;
  source: string;
  isSeed: boolean;
  likes: number;
  comments: number;
  views: number;
  engagement: number; // likes + comments
  mediaUrl: string | null;
  at: string; // ISO — publishedAt ?? scheduledAt ?? createdAt
  // Amplification (repost / quote / retweet). `externalKind` is the post's own
  // kind; `amplifiedFromUser` is the original author we reposted/quoted.
  externalKind: string | null;
  externalUrl: string | null;
  amplifiedFromUser: string | null;
};

export type ProtoCampaign = {
  id: string;
  brandId: string;
  initiativeId: string | null;
  name: string;
  platform: string;
  status: string;
  startAt: string | null; // ISO
  endAt: string | null; // ISO
  budget: number | null;
  spend: number | null;
};

export type ProtoInitiative = {
  id: string;
  brandId: string;
  name: string;
  goal: string | null;
  landingUrl: string | null;
  color: string | null;
  status: string;
  targetChannels: string[] | null;
  budget: number | null;
};

export type FeedProtoData = {
  org: { id: string; name: string } | null;
  brands: ProtoBrand[];
  entries: ProtoEntry[];
  campaigns: ProtoCampaign[];
  initiatives: ProtoInitiative[];
};

export async function loadFeedProtoData(): Promise<FeedProtoData | null> {
  const session = await getSession();
  if (!session?.user) return null;

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org)
    return {
      org: null,
      brands: [],
      entries: [],
      campaigns: [],
      initiatives: [],
    };

  const owned = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
  });
  const ownedIds = owned.map((b) => b.id);

  // Competitor / inspiration brands tracked from our owned brands.
  const inspirations = ownedIds.length
    ? await db.query.brandInspirationTable.findMany({
        where: inArray(brandInspirationTable.brandId, ownedIds),
        with: { inspirationBrand: true },
      })
    : [];

  const refBrands = new Map<string, ProtoBrand>();
  for (const i of inspirations) {
    if (!i.inspirationBrand || refBrands.has(i.inspirationBrandId)) continue;
    refBrands.set(i.inspirationBrandId, {
      id: i.inspirationBrand.id,
      name: i.inspirationBrand.name,
      logo: i.inspirationBrand.logo,
      role: i.purpose === "inspiration" ? "inspiration" : "competitor",
    });
  }

  const brands: ProtoBrand[] = [
    ...owned.map(
      (b): ProtoBrand => ({
        id: b.id,
        name: b.name,
        logo: b.logo,
        role: "owned",
      }),
    ),
    ...refBrands.values(),
  ];
  const allIds = brands.map((b) => b.id);

  const posts = allIds.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, allIds),
          // Preview the post-unseed feed: hide demo rows. Remove this line to
          // show seed data again (or it's moot once `db:unseed` has run).
          eq(platformPostTable.isSeed, false),
          or(
            isNotNull(platformPostTable.publishedAt),
            isNotNull(platformPostTable.scheduledAt),
          ),
        ),
      })
    : [];

  const entries: ProtoEntry[] = posts.map((p) => {
    const likes = p.stats?.likes ?? 0;
    const comments = p.stats?.comments ?? 0;
    const views = p.stats?.views ?? 0;
    return {
      id: p.id,
      brandId: p.brandId,
      platform: p.platform,
      handle: p.username,
      text: p.text,
      status: p.status,
      source: p.source,
      isSeed: p.isSeed,
      likes,
      comments,
      views,
      engagement: likes + comments,
      mediaUrl: displayPoster(p.media),
      at: (p.publishedAt ?? p.scheduledAt ?? p.createdAt).toISOString(),
      externalKind: p.externalKind,
      externalUrl: p.externalUrl,
      amplifiedFromUser: p.amplifiedFrom?.username ?? null,
    };
  });

  const campaignRows = ownedIds.length
    ? await db.query.campaignTable.findMany({
        where: inArray(campaignTable.brandId, ownedIds),
      })
    : [];
  const campaigns: ProtoCampaign[] = campaignRows.map((c) => ({
    id: c.id,
    brandId: c.brandId,
    initiativeId: c.initiativeId,
    name: c.name,
    platform: c.platform,
    status: c.status,
    startAt: c.startAt?.toISOString() ?? null,
    endAt: c.endAt?.toISOString() ?? null,
    budget: c.budget,
    spend: c.spend,
  }));

  const initiativeRows = ownedIds.length
    ? await db.query.initiativeTable.findMany({
        where: inArray(initiativeTable.brandId, ownedIds),
      })
    : [];
  const initiatives: ProtoInitiative[] = initiativeRows.map((i) => ({
    id: i.id,
    brandId: i.brandId,
    name: i.name,
    goal: i.goal,
    landingUrl: i.landingUrl,
    color: i.color,
    status: i.status,
    targetChannels: i.targetChannels ?? null,
    budget: i.budget,
  }));

  return {
    org: { id: org.id, name: org.name },
    brands,
    entries,
    campaigns,
    initiatives,
  };
}
