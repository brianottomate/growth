import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/server/db";
import { contentPostTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import { IdeaOwnerControl, SpotOwnerControl } from "./OwnerControls";

const memberCols = { id: true, name: true, image: true } as const;
const toMember = (
  u: { id: string; name: string | null; image: string | null } | null | undefined,
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

const VIA: Record<string, string> = {
  zernio: "Zernio",
  customerio: "Customer.io",
  native: "Static publish",
  manual: "Manual",
};

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;

const fmtWhen = (d: Date) =>
  d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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
  if (!content || content.brand?.organizationId !== org.id || content.deletedAt) {
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

  // Aggregate analytics across every rendering.
  const totals = posts.reduce(
    (acc, p) => {
      const s = (p.stats) ?? {};
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

      {content.body && (
        <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-relaxed">
          {content.body}
        </p>
      )}

      {/* aggregate analytics */}
      {metrics.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-6 border-y py-4">
          {metrics.map((m) => (
            <div key={m.label}>
              <div className="text-lg font-semibold tabular-nums">
                {fmt(m.value)}
              </div>
              <div className="text-muted-foreground text-[10px] uppercase tracking-wide">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* platform renderings */}
      <h2 className="text-muted-foreground mt-8 mb-3 text-xs font-semibold uppercase tracking-wider">
        Platform posts · {posts.length}
      </h2>
      <div className="flex flex-col gap-2.5">
        {posts.map((p) => {
          const when = p.publishedAt ?? p.scheduledAt ?? p.createdAt;
          const s = (p.stats) ?? {};
          const via = p.provider ? (VIA[p.provider] ?? p.provider) : null;
          return (
            <div
              key={p.id}
              className="bg-card flex items-start gap-3 rounded-xl border p-3.5"
            >
              <ChannelLogo platform={p.platform} className="size-7" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    {platformLabel(p.platform)}
                  </span>
                  {p.username && (
                    <span className="text-muted-foreground text-xs">
                      {p.username}
                    </span>
                  )}
                  <StatusBadge status={p.status} />
                  <div className="ml-auto">
                    <SpotOwnerControl
                      platformPostId={p.id}
                      initialOwner={toMember(p.owner)}
                      members={members}
                      currentUserId={session.user.id}
                    />
                  </div>
                </div>
                {p.text && (
                  <p className="text-muted-foreground mt-1 text-sm">{p.text}</p>
                )}
                <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                  <span>{fmtWhen(when)}</span>
                  {s.likes != null && <span>· {fmt(s.likes)} likes</span>}
                  {s.views != null && <span>· {fmt(s.views)} views</span>}
                  {s.comments != null && <span>· {fmt(s.comments)} comments</span>}
                  {via && <span>· via {via}</span>}
                  {p.externalUrl && (
                    <a
                      href={p.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground underline"
                    >
                      Open ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* series siblings */}
      {content.series && (
        <>
          <h2 className="text-muted-foreground mt-8 mb-3 text-xs font-semibold uppercase tracking-wider">
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

      {/* comments — deferred per content-schema (counts live in stats for now) */}
      <h2 className="text-muted-foreground mt-8 mb-3 text-xs font-semibold uppercase tracking-wider">
        Comments
      </h2>
      <p className="text-muted-foreground text-sm">
        {totals.comments > 0
          ? `${fmt(totals.comments)} comments across all platforms.`
          : "No comments yet."}{" "}
        <span className="text-muted-foreground">
          Full comment threads arrive with the listening / inbox work.
        </span>
      </p>
    </div>
  );
}
