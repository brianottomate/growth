import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "@/server/db";
import {
  channelTable,
  contentPostTable,
  mediaAssetTable,
  memberTable,
  platformPostLinkTable,
  type MediaItem,
} from "@/server/db/schema";
import {
  extractFirstUrl,
  resolveLinkCard,
  type LinkCard,
} from "@/server/services/unfurl.service";
import { RepostSimulation, type RepostSim } from "./RepostSimulation";
import { getSession } from "@/server/better-auth/server";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import { getContentReadiness } from "@/lib/content-readiness";
import { supportsNativeLinkPreview } from "@/lib/platform-link-preview";
import { readCurrentPlatformPostDocument } from "@/lib/platform-post-document";
import { groupPlatformThreads } from "@/lib/platform-thread";
import { IdeaOwnerControl } from "./OwnerControls";
import { CommentThread } from "./CommentThread";
import { AddSpotControl } from "./IdeaControls";
import { SpotCard } from "./SpotCard";
import { ContentPool } from "./ContentPool";
import { ContentAssistantActions } from "./ContentAssistantActions";
import { BriefOverview } from "./BriefOverview";

const memberCols = { id: true, name: true, image: true } as const;
const toMember = (
  u:
    | { id: string; name: string | null; image: string | null }
    | null
    | undefined,
) => (u ? { id: u.id, name: u.name, image: u.image } : null);

const STATUS: Record<string, string> = {
  published: "bg-emerald-500/15 text-emerald-300",
  scheduled: "bg-sky-500/15 text-sky-300",
  approved: "bg-amber-500/15 text-amber-300",
  pending_review: "bg-amber-500/15 text-amber-300",
  discovered: "bg-violet-500/15 text-violet-300",
  draft: "bg-muted text-muted-foreground",
  rejected: "bg-red-500/15 text-red-300",
  archived: "bg-muted text-muted-foreground",
};

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;

/** CMS editor deep link stashed by blog-publish.service in untyped metadata. */
const editorUrlOf = (metadata: unknown): string | null => {
  const url = (metadata as { datocms?: { editorUrl?: unknown } } | null)
    ?.datocms?.editorUrl;
  return typeof url === "string" ? url : null;
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
        STATUS[status] ?? STATUS.draft
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default async function ContentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ contentId: string }>;
  searchParams?: Promise<{ card?: string }>;
}) {
  const { contentId } = await params;
  const resolvedSearchParams = await searchParams;
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  const content = await db.query.contentPostTable.findFirst({
    where: eq(contentPostTable.id, contentId),
    with: {
      brand: true,
      series: true,
      platformPosts: {
        with: {
          owner: { columns: memberCols },
          channel: {
            columns: {
              id: true,
              displayName: true,
              handle: true,
              platform: true,
              profileImageUrl: true,
              bannerImageUrl: true,
            },
          },
        },
      },
      owner: { columns: memberCols },
    },
  });
  // An email-only piece: its real workbench is the newsletter workspace, and
  // the content card is one hop of indirection in the way of every visit. Send
  // the operator straight there. `?card=1` (used by the workspace's own
  // "Content item" link) still opens the card for calendar/premise edits.
  const ownedSpots = (content?.platformPosts ?? []).filter(
    (post) => post.source === "owned",
  );
  const onlyEmail =
    ownedSpots.length === 1 &&
    ownedSpots[0]!.platform === "newsletter" &&
    (ownedSpots[0]!.format === "newsletter.broadcast" ||
      ownedSpots[0]!.format === "newsletter.blast");
  if (content && onlyEmail && resolvedSearchParams?.card !== "1") {
    redirect(`/app/newsletters/${ownedSpots[0]!.id}`);
  }

  if (
    !content ||
    content.brand?.organizationId !== org.id ||
    content.deletedAt
  ) {
    notFound();
  }

  // Org roster for the assignee pickers.
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

  const pillar = content.pillar ? PILLAR_BY_SLUG[content.pillar] : null;
  const publishingChannels = await db.query.channelTable.findMany({
    where: and(
      eq(channelTable.brandId, content.brandId),
      eq(channelTable.defaultProvider, "zernio"),
      eq(channelTable.connectionStatus, "connected"),
      eq(channelTable.isActive, true),
      isNull(channelTable.deletedAt),
    ),
    columns: { platform: true, externalId: true },
  });
  const connectedPlatforms = new Set(
    publishingChannels
      .filter((channel) => channel.externalId)
      .map((channel) => channel.platform),
  );

  // Sibling ideas in the same series.
  const siblings = content.seriesId
    ? await db.query.contentPostTable.findMany({
        where: and(
          eq(contentPostTable.seriesId, content.seriesId),
          ne(contentPostTable.id, content.id),
          isNull(contentPostTable.deletedAt),
        ),
      })
    : [];

  // A MediaItem is a SNAPSHOT taken when the asset was attached, so a poster
  // generated afterwards never reaches it — the pool kept showing a broken
  // tile for a video whose library row had a perfectly good thumbnail. Re-read
  // the current tile for anything that points at a library asset.
  const freshTiles = await (async () => {
    const assetIds = [
      ...new Set(
        [
          ...(content.media ?? []),
          ...content.platformPosts.flatMap((post) => post.media ?? []),
        ]
          .map((item) => item.assetId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!assetIds.length) return new Map<string, string>();
    const rows = await db.query.mediaAssetTable.findMany({
      where: inArray(mediaAssetTable.id, assetIds),
      columns: { id: true, thumbnailUrl: true },
    });
    return new Map(
      rows
        .filter((row) => row.thumbnailUrl)
        .map((row) => [row.id, row.thumbnailUrl!] as const),
    );
  })();
  const withFreshTiles = (items: MediaItem[] | null): MediaItem[] =>
    (items ?? []).map((item) => {
      const tile = item.assetId ? freshTiles.get(item.assetId) : undefined;
      return tile ? { ...item, thumbnail: tile } : item;
    });
  content.media = withFreshTiles(content.media);
  for (const post of content.platformPosts) {
    post.media = withFreshTiles(post.media);
  }

  // Order the renderings by ship time.
  const posts = [...content.platformPosts].sort((a, b) => {
    const ta = (a.publishedAt ?? a.scheduledAt ?? a.createdAt).getTime();
    const tb = (b.publishedAt ?? b.scheduledAt ?? b.createdAt).getTime();
    return ta - tb;
  });
  const postGroups = groupPlatformThreads(posts);
  const rootIdByPostId = new Map(
    postGroups.flatMap((group) =>
      group.items.map((post) => [post.id, group.root.id] as const),
    ),
  );
  // Simulate how planned reposts unfold on the amplifier's feed. A repost of
  // one of our posts renders as a quote-embed; a repost of the blog article
  // renders as the og-card the platform will build from the (predicted) page.
  const repostEdges = posts.length
    ? await db.query.platformPostLinkTable.findMany({
        where: and(
          inArray(
            platformPostLinkTable.toPlatformPostId,
            posts.map((p) => p.id),
          ),
          inArray(platformPostLinkTable.kind, [
            "repost",
            "quote",
            "reposts",
            "quotes",
          ]),
        ),
        with: { from: { with: { brand: { columns: { name: true } } } } },
      })
    : [];
  const simsBySpot = new Map<string, RepostSim[]>();
  for (const edge of repostEdges) {
    const target = posts.find((p) => p.id === edge.toPlatformPostId);
    if (!target || !edge.from) continue;
    const embed: RepostSim["embed"] =
      target.platform === "blog" && target.externalUrl
        ? {
            kind: "article",
            card: (await resolveLinkCard(target.externalUrl)) ?? {
              url: target.externalUrl,
              domain: new URL(target.externalUrl).hostname.replace(
                /^www\./,
                "",
              ),
              title: content.title,
              description: content.hook,
              image: target.media?.[0]?.url ?? content.media?.[0]?.url ?? null,
              predicted: true,
            },
          }
        : {
            kind: "quote",
            authorName: content.brand?.name ?? "Brand",
            text: target.text,
            thumb:
              target.media?.[0]?.thumbnail ??
              target.media?.[0]?.url ??
              content.media?.[0]?.thumbnail ??
              content.media?.[0]?.url ??
              null,
          };
    const rootId =
      rootIdByPostId.get(edge.toPlatformPostId) ?? edge.toPlatformPostId;
    const sims = simsBySpot.get(rootId) ?? [];
    sims.push({
      linkId: edge.id,
      actorName: edge.from.brand?.name ?? "Amplifier",
      actorHandle: edge.from.username,
      platform: edge.from.platform,
      comment: edge.from.text,
      embed,
    });
    simsBySpot.set(rootId, sims);
  }

  // Preview URLs only where the destination platform renders a native card.
  const linkCardBySpot = new Map<string, LinkCard>();
  for (const group of postGroups) {
    if (!supportsNativeLinkPreview(group.root.platform)) continue;
    const url = group.items
      .map((post) => extractFirstUrl(post.text))
      .find((candidate): candidate is string => Boolean(candidate));
    if (!url) continue;
    const card = await resolveLinkCard(url);
    if (card) linkCardBySpot.set(group.root.id, card);
  }

  const readiness = getContentReadiness({
    hook: content.hook,
    status: content.status,
    spots: postGroups.map((group) => ({
      source: group.root.source,
      platform: group.root.platform,
      archetype: group.root.archetype,
      text: group.items
        .map((post) => post.text)
        .filter(Boolean)
        .join("\n\n"),
      scheduledAt: group.root.scheduledAt,
      mediaCount: group.items.reduce(
        (count, post) => count + (post.media?.length ?? 0),
        0,
      ),
      assetLinkCount: group.items.reduce(
        (count, post) => count + (post.assetLinks?.length ?? 0),
        0,
      ),
    })),
  });

  // Aggregate analytics across every rendering.
  const totals = posts.reduce(
    (acc, p) => {
      const s = p.stats ?? {};
      acc.likes += s.likes ?? 0;
      acc.views += s.views ?? 0;
      acc.comments += s.comments ?? 0;
      acc.shares += s.shares ?? 0;
      return acc;
    },
    { likes: 0, views: 0, comments: 0, shares: 0 },
  );

  const metrics = [
    { label: "Views", value: totals.views },
    { label: "Likes", value: totals.likes },
    { label: "Comments", value: totals.comments },
    { label: "Shares", value: totals.shares },
  ].filter((m) => m.value > 0);

  return (
    <div>
      {/* breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/app/content" className="hover:text-foreground">
          Content
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">
          {content.title ?? "Untitled"}
        </span>
      </div>

      {/* header */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {content.title ?? "Untitled"}
        </h1>
        <StatusBadge status={content.status} />
        {content.origin === "ai" && (
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">
            AI
          </span>
        )}
        <div className="ml-auto">
          <IdeaOwnerControl
            contentPostId={content.id}
            initialOwner={toMember(content.owner)}
            members={members}
            currentUserId={session.user.id}
          />
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={`/app/brands/${content.brand?.slug ?? ""}/ads`}
          className="hover:text-foreground"
        >
          {content.brand?.name ?? "—"}
        </Link>
        {pillar && (
          <>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full"
                style={{ background: pillar.color }}
              />
              {pillar.name}
            </span>
          </>
        )}
        {content.series && (
          <>
            <span>·</span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                background: `${content.series.color ?? "#64748b"}22`,
                color: content.series.color ?? "#94a3b8",
              }}
            >
              {content.series.name}
            </span>
          </>
        )}
      </div>

      <BriefOverview
        brief={{
          hook: content.hook,
          captionDirection: content.captionDirection,
          visualDirection: content.visualDirection,
          ctaText: content.ctaText,
          ctaKeyword: content.ctaKeyword,
          kpi: content.kpi,
        }}
        plannedAt={content.plannedAt}
      />

      <ContentAssistantActions
        brandId={content.brandId}
        brandName={content.brand?.name ?? "Brand"}
        contentPostId={content.id}
        contentTitle={content.title ?? "Untitled"}
        readiness={readiness}
      />

      {/* aggregate analytics */}
      {metrics.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-6 border-y py-4">
          {metrics.map((m) => (
            <div key={m.label}>
              <div className="text-lg font-semibold tabular-nums">
                {fmt(m.value)}
              </div>
              <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* content media pool — feeds the spots below */}
      <ContentPool
        contentPostId={content.id}
        brandId={content.brandId}
        brandName={content.brand?.name ?? "Brand"}
        contentTitle={content.title ?? "Untitled"}
        directMedia={content.media ?? []}
        spots={postGroups.map((group) => ({
          id: group.root.id,
          platform: group.root.platform,
          media: group.items.flatMap((post) => post.media ?? []),
        }))}
      />

      {/* platform renderings */}
      <h2 className="mt-8 mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Platform posts · {postGroups.length}
      </h2>
      <div className="flex flex-col gap-2.5">
        {postGroups.map(({ root: p, items }) => (
          <div key={p.id} id={`post-${p.id}`} className="scroll-mt-4">
            <SpotCard
              brandId={content.brandId}
              members={members}
              currentUserId={session.user.id}
              contentPostId={content.id}
              contentTitle={content.title ?? "Untitled"}
              brandName={content.brand?.name ?? "Brand"}
              spot={{
                id: p.id,
                updatedAtISO: p.updatedAt.toISOString(),
                channelId: p.channel?.id ?? p.channelId,
                channelName:
                  p.channel?.displayName ?? p.channel?.handle ?? null,
                channelProfileImageUrl: p.channel?.profileImageUrl ?? null,
                channelBannerImageUrl: p.channel?.bannerImageUrl ?? null,
                platform: p.platform,
                format: p.format,
                archetype: p.archetype,
                template: p.template,
                status: p.status,
                source: p.source,
                username: p.username,
                text: p.text,
                externalUrl: p.externalUrl,
                editorUrl: editorUrlOf(p.metadata),
                previewPath:
                  p.platform === "blog" && p.externalId
                    ? `/app/blog/preview/${p.externalId}`
                    : null,
                provider: p.provider,
                scheduledAtISO: p.scheduledAt
                  ? p.scheduledAt.toISOString()
                  : null,
                publishedAtISO: p.publishedAt
                  ? p.publishedAt.toISOString()
                  : null,
                deliveryExternalId: p.deliveryExternalId,
                deliveryStatus: p.deliveryStatus,
                deliveryError: p.deliveryError,
                firstCommentText: p.firstCommentText,
                firstCommentStatus: p.firstCommentStatus,
                firstCommentError: p.firstCommentError,
                publishingConnected: connectedPlatforms.has(p.platform),
                assetLinks: p.assetLinks,
                media: p.media,
                stats: p.stats,
                owner: toMember(p.owner),
                linkCard: linkCardBySpot.get(p.id) ?? null,
                threadItems: items.map((item) => ({
                  id: item.id,
                  updatedAtISO: item.updatedAt.toISOString(),
                  text: item.text,
                  textDocument: readCurrentPlatformPostDocument({
                    metadata: item.metadata,
                    text: item.text,
                    platform: item.platform,
                  }),
                  media: item.media,
                  assetLinks: item.assetLinks,
                  sequence: item.sequence,
                  scheduledAtISO: item.scheduledAt?.toISOString() ?? null,
                  deliveryExternalId: item.deliveryExternalId,
                  deliveryStatus: item.deliveryStatus,
                  deliveryError: item.deliveryError,
                })),
              }}
            />
            <RepostSimulation sims={simsBySpot.get(p.id) ?? []} />
          </div>
        ))}
      </div>

      <AddSpotControl
        contentPostId={content.id}
        existingTargets={postGroups.map(
          (group) => `${group.root.platform}|${group.root.format ?? ""}`,
        )}
        brandId={content.brandId}
        brandName={content.brand?.name ?? "this brand"}
        contentTitle={content.title ?? "Untitled idea"}
        sourcePlatform={postGroups[0]?.root.platform ?? null}
      />

      {/* series siblings */}
      {content.series && (
        <>
          <h2 className="mt-8 mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            More in “{content.series.name}” · {siblings.length}
          </h2>
          {siblings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No other ideas in this series yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {siblings.map((sib) => (
                <Link
                  key={sib.id}
                  href={`/app/content/${sib.id}`}
                  className="flex items-center justify-between rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40"
                >
                  <span className="truncate text-sm font-medium">
                    {sib.title ?? "Untitled"}
                  </span>
                  <StatusBadge status={sib.status} />
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Team discussion on this idea (audience comment counts live in stats). */}
      <h2 className="mt-8 mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Discussion
      </h2>
      {totals.comments > 0 && (
        <p className="mb-1 text-xs text-muted-foreground">
          {fmt(totals.comments)} audience comments across platforms.
        </p>
      )}
      <CommentThread
        contentPostId={content.id}
        currentUserId={session.user.id}
      />
    </div>
  );
}
