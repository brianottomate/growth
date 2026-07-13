import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { memberTable, platformPostTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ContentAnalysisPanel } from "@/components/content-analysis-panel";
import { readContentAnalysis } from "@/lib/content-analysis";

type BlogMeta = {
  description?: string | null;
  metaDescription?: string | null;
  slug?: string;
  tags?: string[];
};

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  const post = await db.query.platformPostTable.findFirst({
    where: and(
      eq(platformPostTable.id, id),
      eq(platformPostTable.externalKind, "blog_article"),
    ),
    with: { brand: true },
  });
  if (!post || post.brand?.organizationId !== org.id) notFound();

  const meta = (post.metadata ?? {}) as BlogMeta;
  const analysis = readContentAnalysis(post.metadata);
  const cover = post.media?.[0]?.url ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      {/* breadcrumb */}
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Link
          href={
            post.brand?.slug
              ? `/app/blog?brand=${post.brand.slug}`
              : "/app/blog"
          }
          className="hover:text-foreground"
        >
          Blog
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{post.text}</span>
      </div>

      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="mt-4 aspect-[40/21] w-full rounded-xl border object-cover"
        />
      )}

      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        {post.text}
      </h1>

      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-sm">
        {post.publishedAt && (
          <span>
            {post.publishedAt.toLocaleDateString([], {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
        {(meta.tags ?? []).map((tag) => (
          <span
            key={tag}
            className="border-border rounded-full border px-2 py-0.5 text-[11px]"
          >
            {tag}
          </span>
        ))}
      </div>

      {(meta.metaDescription ?? meta.description) && (
        <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
          {meta.metaDescription ?? meta.description}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {post.externalUrl && (
          <a
            href={post.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-foreground text-background rounded-full px-3.5 py-1.5 text-xs font-medium"
          >
            Read original ↗
          </a>
        )}
      </div>

      <p className="text-muted-foreground mt-6 text-xs">
        Full-body rendering and per-post analytics can be added as the source
        adapters expose richer content and performance data.
      </p>

      <ContentAnalysisPanel
        id={post.id}
        kind="blog"
        initialAnalysis={analysis}
        sourceUrl={post.externalUrl}
      />
    </div>
  );
}
