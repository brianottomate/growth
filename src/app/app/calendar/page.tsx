import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable, platformPostTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
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
    return <div className="text-muted-foreground p-8">No organization found.</div>;
  }

  const brands = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
    columns: { id: true, name: true, slug: true, logo: true },
  });
  const brandIds = brands.map((b) => b.id);

  // The calendar shows the whole pipeline — drafts, planned, scheduled, and
  // published — so (unlike the Feed) we don't gate on a ship time. Each post is
  // placed on its most meaningful day, falling back through plan dates.
  const posts = brandIds.length
    ? await db.query.platformPostTable.findMany({
        where: inArray(platformPostTable.brandId, brandIds),
        with: { contentPost: { with: { series: true } } },
      })
    : [];

  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  const entries: CalEntry[] = posts.map((p) => {
    const at =
      p.publishedAt ?? p.scheduledAt ?? p.contentPost?.plannedAt ?? p.createdAt;
    return {
      id: p.id,
      brandId: p.brandId,
      brandName: brandName.get(p.brandId) ?? "—",
      platform: p.platform,
      contentPostId: p.contentPostId,
      title: p.contentPost?.title ?? null,
      pillar: p.contentPost?.pillar ?? null,
      seriesName: p.contentPost?.series?.name ?? null,
      seriesColor: p.contentPost?.series?.color ?? null,
      text: p.text,
      status: p.status,
      isSeed: p.isSeed,
      externalUrl: p.externalUrl,
      handle: p.username,
      at: at.toISOString(),
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
      brands={brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
      nowISO={new Date().toISOString()}
      initial={initial}
    />
  );
}
