import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable, platformPostTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { displayPoster } from "@/lib/utils/media";
import { FeedClient, type FeedEntry } from "./FeedClient";

export default async function FeedPage() {
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

  const brands = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
  });
  const brandIds = brands.map((b) => b.id);

  // A spot enters the Feed once it has a ship time (scheduled) or has published.
  const spots = brandIds.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, brandIds),
          // Hide demo seed rows, EXCEPT the curated "week-jun-2026" batch we
          // want to keep showing alongside real synced content.
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

  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const brandLogos = new Map(brands.map((b) => [b.id, b.logo]));

  const entries: FeedEntry[] = spots.map((p) => ({
    id: p.id,
    brandId: p.brandId,
    brandName: brandName.get(p.brandId) ?? "—",
    brandLogo: brandLogos.get(p.brandId) ?? null,
    platform: p.platform,
    handle: p.username,
    contentPostId: p.contentPostId,
    title: p.contentPost?.title ?? null,
    pillar: p.contentPost?.pillar ?? null,
    seriesName: p.contentPost?.series?.name ?? null,
    seriesColor: p.contentPost?.series?.color ?? null,
    text: p.text,
    status: p.status,
    isSeed: p.isSeed,
    via: p.provider,
    externalUrl: p.externalUrl,
    stats: (p.stats) ?? null,
    mediaUrl: displayPoster(p.media),
    at: (p.publishedAt ?? p.scheduledAt ?? p.createdAt).toISOString(),
    published: p.status === "published",
    externalKind: p.externalKind,
    amplifiedFromUser: p.amplifiedFrom?.username ?? null,
  }));

  return (
    <FeedClient
      entries={entries}
      brands={brands.map((b) => ({ id: b.id, name: b.name }))}
      nowISO={new Date().toISOString()}
    />
  );
}
