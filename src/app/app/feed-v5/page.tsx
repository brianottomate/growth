import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandInspirationTable,
  brandTable,
  contentSuggestionTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { displayPoster } from "@/lib/utils/media";
import {
  V5Client,
  type V5Brand,
  type V5Entry,
  type V5Suggestion,
} from "./V5Client";

/**
 * Feed v5 — the swimlane Timeline. The "absorb / compare" surface: every owned
 * and tracked brand's *shipped* posts on a shared time axis, grouped into lanes
 * (brand / pillar / channel). Retrospective by design — its value is comparing
 * us against peers, and we can't see peers' future, so future/scheduled work is
 * excluded here (that lives in /content). Select pieces to send into Launch or
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
    return (
      <div className="p-8 text-muted-foreground">No organization found.</div>
    );
  }

  const owned = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, logo: true },
  });
  const ownedIds = owned.map((b) => b.id);

  // Competitor / inspiration brands tracked from our owned brands (org=NULL).
  const trackedLinks = ownedIds.length
    ? await db.query.brandInspirationTable.findMany({
        where: inArray(brandInspirationTable.brandId, ownedIds),
        with: {
          inspirationBrand: { columns: { id: true, name: true, logo: true } },
        },
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
    ...owned.map((b): V5Brand => ({
      id: b.id,
      name: b.name,
      logo: b.logo,
      role: "owned",
    })),
    ...tracked.values(),
  ];
  const allIds = brands.map((b) => b.id);
  const roleById = new Map(brands.map((b) => [b.id, b] as const));

  // Retrospective only: a spot enters the Timeline once it has actually shipped
  // (publishedAt set). Future/scheduled work is excluded — peers have no
  // comparable future, so it would be apples-to-nothing here.
  const posts = allIds.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, allIds),
          // Hide demo seed rows, except the curated "week-jun-2026" batch.
          or(
            eq(platformPostTable.isSeed, false),
            sql`${platformPostTable.metadata}->>'seedBatch' = 'week-jun-2026'`,
          ),
          isNotNull(platformPostTable.publishedAt),
        ),
        with: { contentPost: { with: { series: true } } },
      })
    : [];

  // Pending AI grouping proposals for owned brands — surfaced as dashed
  // "Inferred" trays on the timeline (the in-context alternative to /grouping).
  const suggestionRows = ownedIds.length
    ? await db.query.contentSuggestionTable.findMany({
        where: and(
          eq(contentSuggestionTable.kind, "grouping"),
          eq(contentSuggestionTable.status, "pending"),
          inArray(contentSuggestionTable.brandId, ownedIds),
        ),
      })
    : [];
  type Proposed = {
    unit?: string;
    title?: string;
    groupKind?: string;
    memberPostIds?: string[];
  };
  const suggestions: V5Suggestion[] = suggestionRows
    .map((s) => {
      const p = (s.proposed ?? {}) as Proposed;
      return {
        id: s.id,
        title: p.title ?? "Grouping",
        groupKind: p.groupKind ?? "group",
        unit: p.unit === "series" ? ("series" as const) : ("single" as const),
        memberIds: p.memberPostIds ?? [],
      };
    })
    .filter((s) => s.memberIds.length > 1);

  const entries: V5Entry[] = posts.map((p) => {
    const b = roleById.get(p.brandId);
    return {
      id: p.id,
      brandId: p.brandId,
      brandName: b?.name ?? "—",
      brandLogo: b?.logo ?? null,
      role: b?.role ?? "owned",
      platform: p.platform,
      format: p.format,
      archetype: p.archetype,
      handle: p.username,
      contentPostId: p.contentPostId,
      title: p.contentPost?.title ?? null,
      pillar: p.contentPost?.pillar ?? p.pillar ?? null,
      seriesName: p.contentPost?.series?.name ?? null,
      seriesColor: p.contentPost?.series?.color ?? null,
      text: p.text,
      status: p.status,
      externalUrl: p.externalUrl,
      externalKind: p.externalKind,
      mediaUrl: displayPoster(p.media),
      media: p.media ?? [],
      likes: p.stats?.likes ?? 0,
      comments: p.stats?.comments ?? 0,
      views: p.stats?.views ?? 0,
      at: (p.publishedAt ?? p.scheduledAt ?? p.createdAt).toISOString(),
    };
  });

  return (
    <V5Client
      brands={brands}
      entries={entries}
      suggestions={suggestions}
      nowISO={new Date().toISOString()}
    />
  );
}
