import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable, platformPostTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { CoverWall, type CoverItem } from "@/components/cover-wall";

// Initial stats link-out — per the plan, blogs link to Amplitude until we
// surface per-post numbers in-app. Blog performance dashboard.
const AMPLITUDE_URL =
  "https://app.amplitude.com/analytics/wander-hq/dashboard/aqc691oc";

type BlogMeta = {
  description?: string | null;
  metaDescription?: string | null;
  slug?: string;
  tags?: string[];
};

const monthKey = (d: Date) =>
  d.toLocaleDateString([], { month: "long", year: "numeric" });

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; view?: string }>;
}) {
  const { tag: tagFilter, view: viewParam } = await searchParams;
  const view: "list" | "wall" = viewParam === "wall" ? "wall" : "list";
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) return <div className="text-muted-foreground">No organization found.</div>;

  const brands = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
  });
  const brandIds = brands.map((b) => b.id);

  const posts = brandIds.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, brandIds),
          eq(platformPostTable.externalKind, "blog_article"),
          isNotNull(platformPostTable.publishedAt),
        ),
        orderBy: [desc(platformPostTable.publishedAt)],
      })
    : [];

  const tagged = posts.map((p) => {
    const meta = (p.metadata ?? {}) as BlogMeta;
    return {
      post: p,
      tags: meta.tags ?? [],
      description: meta.metaDescription ?? meta.description ?? null,
    };
  });

  // Tag (topic) facets.
  const tagCounts = new Map<string, number>();
  for (const t of tagged)
    for (const tag of t.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  const visible = tagFilter
    ? tagged.filter((t) => t.tags.includes(tagFilter))
    : tagged;

  // Build cover items (image-backed — cheap, no live iframes).
  const items: CoverItem[] = visible.map((t) => ({
    id: t.post.id,
    href: `/app/blog/${t.post.id}`,
    title: t.post.text ?? "Untitled",
    subtitle: t.description,
    date: t.post.publishedAt!.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    badge: t.tags[0] ? { label: t.tags[0], color: "#38bdf8" } : undefined,
    coverImage: t.post.media?.[0]?.url ?? null,
  }));

  // Group for list view.
  const months: { key: string; items: typeof visible }[] = [];
  for (const t of visible) {
    const k = monthKey(t.post.publishedAt!);
    let m = months.find((x) => x.key === k);
    if (!m) {
      m = { key: k, items: [] };
      months.push(m);
    }
    m.items.push(t);
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Blog</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {tagged.length} articles · wander.com/blog · via DatoCMS
          </p>
        </div>
        <a
          href={AMPLITUDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-accent rounded-full border px-3 py-1.5 text-xs font-medium"
        >
          Blog performance ↗
        </a>
      </div>

      {/* topic (tag) facets */}
      <div className="mt-5 flex flex-wrap gap-2 border-b pb-4">
        <Link
          href="/app/blog"
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            !tagFilter
              ? "bg-foreground text-background border-foreground"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          All · {tagged.length}
        </Link>
        {topTags.map(([tag, n]) => (
          <Link
            key={tag}
            href={`/app/blog?tag=${encodeURIComponent(tag)}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              tagFilter === tag
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {tag} · {n}
          </Link>
        ))}
      </div>

      {/* view toggle */}
      <div className="mt-4 flex items-center gap-2">
        {(["list", "wall"] as const).map((v) => (
          <Link
            key={v}
            href={`/app/blog?view=${v}${tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : ""}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
              view === v
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {v}
          </Link>
        ))}
      </div>

      {view === "wall" ? (
        <div className="mt-6">
          <CoverWall items={items} />
        </div>
      ) : (
        months.map((m) => (
          <section key={m.key} className="mt-8">
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
              {m.key} · {m.items.length}
            </h2>
            <div className="flex flex-col">
              {m.items.map((t) => (
                <Link
                  key={t.post.id}
                  href={`/app/blog/${t.post.id}`}
                  className="hover:bg-accent/40 -mx-2 flex items-center gap-3 rounded-lg border-b px-2 py-3 text-sm transition-colors last:border-0"
                >
                  <span className="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">
                    {t.post.publishedAt!.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t.post.text}</span>
                  <span className="text-muted-foreground hidden shrink-0 gap-1 text-[11px] sm:flex">
                    {t.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="border-border rounded-full border px-1.5 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </span>
                  <span className="text-muted-foreground/60 w-4 shrink-0 text-right text-xs">↗</span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}

      {visible.length === 0 && (
        <p className="text-muted-foreground mt-10 text-sm">No articles for this filter.</p>
      )}
    </div>
  );
}
