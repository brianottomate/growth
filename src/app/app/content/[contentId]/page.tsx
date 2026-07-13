import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/server/db";
import { contentPostTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import { getContentReadiness } from "@/lib/content-readiness";
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
}: {
  params: Promise<{ contentId: string }>;
}) {
  const { contentId } = await params;
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
      platformPosts: { with: { owner: { columns: memberCols } } },
      owner: { columns: memberCols },
    },
  });
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

  // Order the renderings by ship time.
  const posts = [...content.platformPosts].sort((a, b) => {
    const ta = (a.publishedAt ?? a.scheduledAt ?? a.createdAt).getTime();
    const tb = (b.publishedAt ?? b.scheduledAt ?? b.createdAt).getTime();
    return ta - tb;
  });
  const readiness = getContentReadiness({
    hook: content.hook,
    status: content.status,
    spots: posts.map((post) => ({
      source: post.source,
      platform: post.platform,
      archetype: post.archetype,
      text: post.text,
      scheduledAt: post.scheduledAt,
      mediaCount: post.media?.length ?? 0,
      assetLinkCount: post.assetLinks?.length ?? 0,
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
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Link href="/app/content" className="hover:text-foreground">
          Content
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">
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
      <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-sm">
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
              <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
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
        spots={posts.map((p) => ({
          id: p.id,
          platform: p.platform,
          media: p.media ?? [],
        }))}
      />

      {/* platform renderings */}
      <h2 className="text-muted-foreground mt-8 mb-3 text-xs font-semibold tracking-wider uppercase">
        Platform posts · {posts.length}
      </h2>
      <div className="flex flex-col gap-2.5">
        {posts.map((p) => (
          <SpotCard
            key={p.id}
            brandId={content.brandId}
            members={members}
            currentUserId={session.user.id}
            contentPostId={content.id}
            contentTitle={content.title ?? "Untitled"}
            brandName={content.brand?.name ?? "Brand"}
            spot={{
              id: p.id,
              platform: p.platform,
              format: p.format,
              archetype: p.archetype,
              template: p.template,
              status: p.status,
              source: p.source,
              username: p.username,
              text: p.text,
              externalUrl: p.externalUrl,
              provider: p.provider,
              scheduledAtISO: p.scheduledAt
                ? p.scheduledAt.toISOString()
                : null,
              publishedAtISO: p.publishedAt
                ? p.publishedAt.toISOString()
                : null,
              assetLinks: p.assetLinks,
              media: p.media,
              stats: p.stats,
              owner: toMember(p.owner),
            }}
          />
        ))}
      </div>

      <AddSpotControl
        contentPostId={content.id}
        existingPlatforms={posts.map((p) => p.platform)}
      />

      {/* series siblings */}
      {content.series && (
        <>
          <h2 className="text-muted-foreground mt-8 mb-3 text-xs font-semibold tracking-wider uppercase">
            More in “{content.series.name}” · {siblings.length}
          </h2>
          {siblings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No other ideas in this series yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {siblings.map((sib) => (
                <Link
                  key={sib.id}
                  href={`/app/content/${sib.id}`}
                  className="bg-card hover:bg-accent/40 flex items-center justify-between rounded-lg border p-3 transition-colors"
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
      <h2 className="text-muted-foreground mt-8 mb-1 text-xs font-semibold tracking-wider uppercase">
        Discussion
      </h2>
      {totals.comments > 0 && (
        <p className="text-muted-foreground mb-1 text-xs">
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
