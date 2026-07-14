import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandInspirationTable,
  brandTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { displayPoster } from "@/lib/utils/media";
import { CalendarClient, type CalEntry } from "./CalendarClient";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    brand?: string;
    pillar?: string;
    y?: string;
    m?: string;
  }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const sp = await searchParams;

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return (
      <div className="text-muted-foreground p-8">No organization found.</div>
    );
  }

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true, logo: true },
  });
  const brandIds = brands.map((b) => b.id);

  // Tracked/reference brands (org=NULL) scraped into platform_post — include the
  // ones our owned brands track so competitor content shows on the calendar.
  const trackedLinks = brandIds.length
    ? await db.query.brandInspirationTable.findMany({
        where: inArray(brandInspirationTable.brandId, brandIds),
        with: { inspirationBrand: { columns: { id: true, name: true } } },
      })
    : [];
  const trackedBrands = new Map<string, string>();
  for (const l of trackedLinks) {
    if (l.inspirationBrand)
      trackedBrands.set(l.inspirationBrand.id, l.inspirationBrand.name);
  }
  const allBrandIds = [...brandIds, ...trackedBrands.keys()];

  // The calendar shows the whole pipeline — drafts, planned, scheduled, and
  // published — so (unlike the Feed) we don't gate on a ship time. Each post is
  // placed on its most meaningful day, falling back through plan dates.
  const memberCols = { id: true, name: true, image: true } as const;
  const posts = allBrandIds.length
    ? await db.query.platformPostTable.findMany({
        where: inArray(platformPostTable.brandId, allBrandIds),
        with: {
          contentPost: {
            with: { series: true, owner: { columns: memberCols } },
          },
          owner: { columns: memberCols },
        },
      })
    : [];

  // Org roster for the assignee picker.
  const members = (
    await db.query.memberTable.findMany({
      where: eq(memberTable.organizationId, org.id),
      with: { user: { columns: memberCols } },
    })
  )
    .map((m) => m.user)
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({ id: u.id, name: u.name, image: u.image }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  const brandName = new Map([
    ...brands.map((b) => [b.id, b.name] as const),
    ...trackedBrands,
  ]);

  const entries: CalEntry[] = posts.map((p) => {
    const at =
      p.publishedAt ?? p.scheduledAt ?? p.contentPost?.plannedAt ?? p.createdAt;
    return {
      id: p.id,
      brandId: p.brandId,
      brandName: brandName.get(p.brandId) ?? "—",
      tracked: trackedBrands.has(p.brandId),
      platform: p.platform,
      format: p.format,
      contentPostId: p.contentPostId,
      title: p.contentPost?.title ?? null,
      pillar: p.contentPost?.pillar ?? null,
      seriesName: p.contentPost?.series?.name ?? null,
      seriesColor: p.contentPost?.series?.color ?? null,
      text: p.text,
      status: p.status,
      isSeed: p.isSeed,
      externalUrl: p.externalUrl,
      mediaUrl: displayPoster(p.media),
      handle: p.username,
      at: at.toISOString(),
      ideaOwner: p.contentPost?.owner
        ? {
            id: p.contentPost.owner.id,
            name: p.contentPost.owner.name,
            image: p.contentPost.owner.image,
          }
        : null,
      spotOwner: p.owner
        ? { id: p.owner.id, name: p.owner.name, image: p.owner.image }
        : null,
    };
  });

  // Deep-link target (from the Studio wheel): focus a brand/pillar/month.
  const initialMonth = sp.m != null ? Number(sp.m) : undefined;
  const initialYear = sp.y != null ? Number(sp.y) : undefined;
  const initial = {
    brandId: sp.brand && brandIds.includes(sp.brand) ? sp.brand : undefined,
    pillar: sp.pillar || undefined,
    month: Number.isInteger(initialMonth) ? initialMonth : undefined,
    year: Number.isInteger(initialYear) ? initialYear : undefined,
  };

  return (
    <CalendarClient
      entries={entries}
      brands={[
        ...brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug })),
        ...[...trackedBrands].map(([id, name]) => ({ id, name, slug: null })),
      ]}
      ownedBrands={brands
        .map((b) => ({ id: b.id, name: b.name, slug: b.slug }))
        // Flagship first — the default Generate-slots target.
        .sort(
          (a, b) => Number(b.slug === "wander") - Number(a.slug === "wander"),
        )
        .map(({ id, name }) => ({ id, name }))}
      members={members}
      currentUserId={session.user.id}
      nowISO={new Date().toISOString()}
      initial={initial}
    />
  );
}
