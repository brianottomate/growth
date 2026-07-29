import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { StructuredText } from "react-datocms/structured-text";

import { db } from "@/server/db";
import { memberTable, platformPostTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { getBlogArticleDraft } from "@/server/clients/datocms-cda.client";
import { PreviewBlock } from "../preview/[itemId]/PreviewBlocks";

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
  const datoArticle = post.externalId
    ? await getBlogArticleDraft(post.externalId).catch(() => null)
    : null;
  const isDraft = datoArticle
    ? datoArticle._status !== "published"
    : post.status !== "published" || !post.publishedAt;
  const title = datoArticle?.title ?? post.text ?? "Untitled";
  const description =
    datoArticle?.description ??
    meta.metaDescription ??
    meta.description ??
    null;
  const cover = datoArticle?.image?.url ?? post.media?.[0]?.url ?? null;
  const draftPreviewHref =
    isDraft && post.externalId ? `/app/blog/preview/${post.externalId}` : null;

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
        <span className="text-foreground font-medium">{title}</span>
      </div>

      {isDraft && (
        <section className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-amber-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold tracking-wider text-black uppercase">
                  Draft
                </span>
                <h2 className="text-sm font-semibold">Not published</h2>
              </div>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-amber-100/75">
                This is the current DatoCMS draft. The reserved wander.com URL
                will not show the article until a human publishes it.
              </p>
            </div>
            {draftPreviewHref && (
              <Link
                href={draftPreviewHref}
                className="rounded-full border border-amber-300/40 px-3 py-1.5 text-xs font-medium hover:bg-amber-300/10"
              >
                Open standalone preview
              </Link>
            )}
          </div>
        </section>
      )}

      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="mt-4 aspect-[40/21] w-full rounded-xl border object-cover"
        />
      )}

      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>

      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-sm">
        {!isDraft && post.publishedAt && (
          <span>
            {post.publishedAt.toLocaleDateString([], {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
        {isDraft && (
          <span className="font-medium text-amber-300">DatoCMS draft</span>
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

      {description && (
        <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
          {description}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {!isDraft && post.externalUrl && (
          <a
            href={post.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-foreground text-background rounded-full px-3.5 py-1.5 text-xs font-medium"
          >
            Read original ↗
          </a>
        )}
        {draftPreviewHref && (
          <Link
            href={draftPreviewHref}
            className="bg-foreground text-background rounded-full px-3.5 py-1.5 text-xs font-medium"
          >
            Read full draft
          </Link>
        )}
      </div>

      {datoArticle?.body ? (
        <section className="mt-10 border-t pt-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              {isDraft ? "Draft body" : "Article body"}
            </h2>
            {isDraft && (
              <span className="text-xs font-medium text-amber-300">
                Current DatoCMS version
              </span>
            )}
          </div>
          <div className="prose prose-invert prose-neutral max-w-none">
            <StructuredText
              data={datoArticle.body}
              renderBlock={({ record }) => <PreviewBlock block={record} />}
            />
          </div>
        </section>
      ) : (
        <p className="text-muted-foreground mt-6 text-xs">
          This imported record currently exposes summary metadata only.
        </p>
      )}
    </div>
  );
}
