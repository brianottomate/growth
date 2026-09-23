import { WorkspaceBreadcrumbs } from "@/components/workspace-breadcrumbs";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  channelTable,
  contentPostTable,
  memberTable,
} from "@/server/db/schema";
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

  // The segment is the slug, or the brand id when a tool only has that.
  const brand = await db.query.brandTable.findFirst({
    where: and(
      or(eq(brandTable.slug, brandSlug), eq(brandTable.id, brandSlug)),
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

  // Drafts are not bound to a channel until they publish; the brand's own
  // channel for the platform is what the post will actually show as.
  const channels = await db.query.channelTable.findMany({
    where: and(
      eq(channelTable.brandId, brand.id),
      isNull(channelTable.deletedAt),
    ),
    columns: {
      platform: true,
      displayName: true,
      handle: true,
      profileImageUrl: true,
    },
  });
  const channelFor = (platform: string) =>
    channels.find((channel) => channel.platform === platform) ?? null;

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
          width: item.width ?? null,
          height: item.height ?? null,
        })),
        channel: {
          displayName:
            spot.channel?.displayName ??
            channelFor(spot.platform)?.displayName ??
            null,
          handle:
            spot.channel?.handle ??
            spot.username ??
            channelFor(spot.platform)?.handle ??
            null,
          profileImageUrl:
            spot.channel?.profileImageUrl ??
            channelFor(spot.platform)?.profileImageUrl ??
            null,
        },
      })),
  }));

  // Calendar order, undated last: the reader is checking a run of posts.
  const ordered = [...ideas].sort((a, b) => {
    if (!a.plannedAt) return b.plannedAt ? 1 : 0;
    if (!b.plannedAt) return -1;
    return a.plannedAt.localeCompare(b.plannedAt);
  });

  return (
    <>
      <WorkspaceBreadcrumbs
        items={[
          { label: "Brands", href: "/app/brands" },
          { label: brand.name, href: `/app/brands/${brand.slug ?? brandSlug}` },
          { label: "Organic previews" },
        ]}
      />
      <PreviewsClient
        brand={{
          name: brand.name,
          slug: brand.slug ?? brandSlug,
          logo: brand.logo,
        }}
        ideas={ordered}
        picking={ids.length === 0}
      />
    </>
  );
}
