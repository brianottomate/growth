import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, contentPostTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";

import { PreviewsClient, type PreviewIdea } from "./PreviewsClient";

export const dynamic = "force-dynamic";

/**
 * /app/brands/[brandSlug]/previews?ids=post_a,post_b — a chosen set of ideas
 * rendered as their planned platform posts, stripped of workbench controls.
 * The page colleagues get sent for a yes/no on a batch. Without `ids` it
 * shows a picker that builds the link.
 */
export default async function BrandPreviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams?: Promise<{ ids?: string; contentPostIds?: string }>;
}) {
  const { brandSlug } = await params;
  const query = (await searchParams) ?? {};
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, brandSlug),
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true, logo: true },
  });
  if (!brand) notFound();

  const ids = [
    ...new Set(
      (query.ids ?? query.contentPostIds ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];

  const rows = await db.query.contentPostTable.findMany({
    where: and(
      eq(contentPostTable.brandId, brand.id),
      isNull(contentPostTable.deletedAt),
      ids.length
        ? inArray(contentPostTable.id, ids)
        : notInArray(contentPostTable.status, ["archived", "rejected"]),
    ),
    orderBy: [
      desc(contentPostTable.plannedAt),
      desc(contentPostTable.createdAt),
    ],
    limit: ids.length ? ids.length : 60,
    with: {
      platformPosts: {
        with: {
          channel: {
            columns: {
              displayName: true,
              handle: true,
              profileImageUrl: true,
            },
          },
        },
      },
    },
  });

  const ideas: PreviewIdea[] = rows.map((row) => ({
    id: row.id,
    title: row.title ?? "Untitled idea",
    hook: row.hook,
    pillar: row.pillar,
    status: row.status,
    plannedAt: row.plannedAt?.toISOString() ?? null,
    spots: row.platformPosts
      .filter((spot) => spot.source === "owned" && !spot.parentPlatformPostId)
      .sort((a, b) => a.platform.localeCompare(b.platform))
      .map((spot) => ({
        id: spot.id,
        platform: spot.platform,
        format: spot.format,
        status: spot.status,
        text: spot.text ?? "",
        firstComment: spot.firstCommentText,
        scheduledAt: spot.scheduledAt?.toISOString() ?? null,
        media: (spot.media ?? []).map((item) => ({
          url: item.url,
          type: item.type,
          thumbnail: item.thumbnail ?? null,
        })),
        channel: {
          displayName: spot.channel?.displayName ?? null,
          handle: spot.channel?.handle ?? spot.username ?? null,
          profileImageUrl: spot.channel?.profileImageUrl ?? null,
        },
      })),
  }));

  // Keep the operator's order when they chose the set.
  const ordered = ids.length
    ? ids
        .map((id) => ideas.find((idea) => idea.id === id))
        .filter((idea): idea is PreviewIdea => Boolean(idea))
    : ideas;

  return (
    <PreviewsClient
      brand={{
        name: brand.name,
        slug: brand.slug ?? brandSlug,
        logo: brand.logo,
      }}
      ideas={ordered}
      picking={ids.length === 0}
    />
  );
}
