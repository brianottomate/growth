import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandInspirationTable,
  brandTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { displayPoster } from "@/lib/utils/media";
import { V5Client, type V5Brand, type V5Entry } from "./V5Client";

/**
 * Feed v5 — the swimlane Timeline. The "absorb / compare" surface: every owned
 * and tracked brand's shipped + scheduled posts on a shared time axis, grouped
 * into lanes (brand / pillar / channel). Select pieces to send into Launch or
 * a Grouping. Replaces the feed-v2/v3/v4 prototypes.
 */
export default async function FeedV5Page() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return <div className="text-muted-foreground p-8">No organization found.</div>;
  }

  const owned = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
    columns: { id: true, name: true, logo: true },
  });
  const ownedIds = owned.map((b) => b.id);

  // Competitor / inspiration brands tracked from our owned brands (org=NULL).
  const trackedLinks = ownedIds.length
    ? await db.query.brandInspirationTable.findMany({
        where: inArray(brandInspirationTable.brandId, ownedIds),
        with: { inspirationBrand: { columns: { id: true, name: true, logo: true } } },
      })
    : [];
  const tracked = new Map<string, V5Brand>();
  for (const l of trackedLinks) {
    const b = l.inspirationBrand;
    if (b && !tracked.has(b.id)) {
      tracked.set(b.id, {
        id: b.id,
        name: b.name,
        logo: b.logo,
        role: l.purpose === "inspiration" ? "inspiration" : "competitor",
      });
    }
  }

  const brands: V5Brand[] = [
    ...owned.map((b): V5Brand => ({ id: b.id, name: b.name, logo: b.logo, role: "owned" })),
    ...tracked.values(),
  ];
  const allIds = brands.map((b) => b.id);
  const roleById = new Map(brands.map((b) => [b.id, b] as const));

  // A spot enters the Timeline once it has a ship time (scheduled) or published.
  const posts = allIds.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, allIds),
          // Hide demo seed rows, except the curated "week-jun-2026" batch.
          or(
            eq(platformPostTable.isSeed, false),
            sql`${platformPostTable.metadata}->>'seedBatch' = 'week-jun-2026'`,
          ),
          or(
            isNotNull(platformPostTable.publishedAt),
            isNotNull(platformPostTable.scheduledAt),
          ),
        ),
        with: { contentPost: { with: { series: true } } },
      })
    : [];

  const entries: V5Entry[] = posts.map((p) => {
    const b = roleById.get(p.brandId);
    return {
      id: p.id,
      brandId: p.brandId,
      brandName: b?.name ?? "—",
      brandLogo: b?.logo ?? null,
      role: b?.role ?? "owned",
      platform: p.platform,
      handle: p.username,
      contentPostId: p.contentPostId,
      title: p.contentPost?.title ?? null,
      pillar: p.contentPost?.pillar ?? null,
      seriesName: p.contentPost?.series?.name ?? null,
      seriesColor: p.contentPost?.series?.color ?? null,
      text: p.text,
      status: p.status,
      externalUrl: p.externalUrl,
      externalKind: p.externalKind,
      mediaUrl: displayPoster(p.media),
      likes: p.stats?.likes ?? 0,
      comments: p.stats?.comments ?? 0,
      views: p.stats?.views ?? 0,
      at: (p.publishedAt ?? p.scheduledAt ?? p.createdAt).toISOString(),
    };
  });

  return (
    <V5Client brands={brands} entries={entries} nowISO={new Date().toISOString()} />
  );
}
