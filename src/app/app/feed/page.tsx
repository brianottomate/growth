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
    return (
      <div className="p-8 text-muted-foreground">No organization found.</div>
    );
  }

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
  });
  const brandIds = brands.map((b) => b.id);

  // Tracked/reference brands (competitor + inspiration) scraped into platform_post
  // live under org=NULL brand rows, so include the ones our owned brands track.
  const trackedLinks = brandIds.length
    ? await db.query.brandInspirationTable.findMany({
        where: inArray(brandInspirationTable.brandId, brandIds),
        with: { inspirationBrand: true },
      })
    : [];
  const trackedBrands = new Map<
    string,
    { name: string; logo: string | null }
  >();
  for (const l of trackedLinks) {
    if (l.inspirationBrand) {
      trackedBrands.set(l.inspirationBrand.id, {
        name: l.inspirationBrand.name,
        logo: l.inspirationBrand.logo,
      });
    }
  }
  const trackedIds = [...trackedBrands.keys()];
  const allBrandIds = [...brandIds, ...trackedIds];

  // A spot enters the Feed once it has a ship time (scheduled) or has published.
  const spots = allBrandIds.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, allBrandIds),
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
        with: {
          contentPost: { with: { series: true } },
          owner: { columns: { id: true, name: true, image: true } },
        },
      })
    : [];

  // Org roster for the assignee picker.
  const members = (
    await db.query.memberTable.findMany({
      where: eq(memberTable.organizationId, org.id),
      with: { user: { columns: { id: true, name: true, image: true } } },
    })
  )
    .map((m) => m.user)
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({ id: u.id, name: u.name, image: u.image }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const brandLogos = new Map(brands.map((b) => [b.id, b.logo]));
  for (const [id, b] of trackedBrands) {
    brandName.set(id, b.name);
    brandLogos.set(id, b.logo);
  }

  const entries: FeedEntry[] = spots.map((p) => ({
    id: p.id,
    brandId: p.brandId,
    brandName: brandName.get(p.brandId) ?? "—",
    brandLogo: brandLogos.get(p.brandId) ?? null,
    tracked: trackedBrands.has(p.brandId),
    platform: p.platform,
    handle: p.username,
    contentPostId: p.contentPostId,
    title: p.contentPost?.title ?? null,
    pillar: p.contentPost?.pillar ?? p.pillar ?? null,
    seriesName: p.contentPost?.series?.name ?? null,
    seriesColor: p.contentPost?.series?.color ?? null,
    text: p.text,
    status: p.status,
    isSeed: p.isSeed,
    via: p.provider,
    externalUrl: p.externalUrl,
    stats: p.stats ?? null,
    mediaUrl: displayPoster(p.media),
    at: (p.publishedAt ?? p.scheduledAt ?? p.createdAt).toISOString(),
    published: p.status === "published",
    externalKind: p.externalKind,
    amplifiedFromUser: p.amplifiedFrom?.username ?? null,
    owner: p.owner
      ? { id: p.owner.id, name: p.owner.name, image: p.owner.image }
      : null,
  }));

  return (
    <FeedClient
      entries={entries}
      brands={[
        ...brands.map((b) => ({ id: b.id, name: b.name })),
        ...[...trackedBrands].map(([id, b]) => ({ id, name: b.name })),
      ]}
      members={members}
      currentUserId={session.user.id}
      nowISO={new Date().toISOString()}
    />
  );
}
