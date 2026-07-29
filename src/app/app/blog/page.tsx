import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable, platformPostTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { CoverWall, type CoverItem } from "@/components/cover-wall";
import { readSocialPreviewMode } from "@/lib/social-preview";
import { BlogControls } from "./BlogControls";

type BlogMeta = {
  description?: string | null;
  metaDescription?: string | null;
  slug?: string;
  tags?: string[];
};

const monthKey = (d: Date) =>
  d.toLocaleDateString([], { month: "long", year: "numeric" });

const blogThumbnailUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("datocms-assets.com")) {
      parsed.searchParams.set("w", "160");
      parsed.searchParams.set("h", "100");
      parsed.searchParams.set("fit", "crop");
      parsed.searchParams.set("auto", "format");
    }
    return parsed.toString();
  } catch {
    return url;
  }
};

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{
    tag?: string;
    view?: string;
    brand?: string;
    preview?: string;
  }>;
}) {
  const {
    tag: tagFilter,
    view: viewParam,
    brand: brandParam,
    preview: previewParam,
  } = await searchParams;
  const preview = readSocialPreviewMode(previewParam);
  const view: "list" | "wall" = viewParam === "wall" ? "wall" : "list";
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    orderBy: (brand, { asc }) => asc(brand.createdAt),
  });
  const selectedBrand = brandParam
    ? (brands.find((brand) => brand.slug === brandParam) ?? null)
    : null;
  const brandIds = selectedBrand
    ? [selectedBrand.id]
    : brands.map((brand) => brand.id);

  // Drafts included on purpose. This page used to be published-only, which
  // meant an article being written was invisible here until it shipped and was
  // synced — so work in progress had no home. Unpublished rows sort first by
  // creation time, since they have no publishedAt.
  const posts = brandIds.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, brandIds),
          eq(platformPostTable.externalKind, "blog_article"),
        ),
        orderBy: [
          desc(platformPostTable.publishedAt),
          desc(platformPostTable.createdAt),
        ],
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
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const visible = tagFilter
    ? tagged.filter((t) => t.tags.includes(tagFilter))
    : tagged;
  const blogHref = (input?: { tag?: string; view?: "list" | "wall" }) => {
    const params = new URLSearchParams();
    if (selectedBrand?.slug) params.set("brand", selectedBrand.slug);
    if (preview !== "original") params.set("preview", preview);
    if (input?.tag) params.set("tag", input.tag);
    if (input?.view) params.set("view", input.view);
    const query = params.toString();
    return query ? `/app/blog?${query}` : "/app/blog";
  };

  // Drafts have no publishedAt, so every date read falls back to createdAt.
  const dateOf = (p: (typeof visible)[number]["post"]) =>
    p.publishedAt ?? p.createdAt;

  // Build cover items (image-backed — cheap, no live iframes).
  const items: CoverItem[] = visible.map((t) => ({
    id: t.post.id,
    href: `/app/blog/${t.post.id}`,
    title: t.post.text ?? "Untitled",
    subtitle: t.description,
    date: dateOf(t.post).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    badge: !t.post.publishedAt
      ? { label: "Draft", color: "#fbbf24" }
      : t.tags[0]
        ? { label: t.tags[0], color: "#38bdf8" }
        : undefined,
    coverImage: t.post.media?.[0]?.url ?? null,
  }));

  // Group for list view.
  const months: { key: string; items: typeof visible }[] = [];
  for (const t of visible) {
    const k = monthKey(dateOf(t.post));
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
            {tagged.length} articles
            {selectedBrand
              ? ` · ${selectedBrand.name}${selectedBrand.website ? ` · ${new URL(/^https?:\/\//i.test(selectedBrand.website) ? selectedBrand.website : `https://${selectedBrand.website}`).hostname.replace(/^www\./, "")}` : ""}`
              : ` · across ${brands.length} brands`}
          </p>
        </div>
        <BlogControls
          brands={brands.flatMap((brand) =>
            brand.slug
              ? [
                  {
                    id: brand.id,
                    slug: brand.slug,
                    name: brand.name,
                    website: brand.website,
                  },
                ]
              : [],
          )}
          selectedBrandSlug={selectedBrand?.slug ?? null}
        />
      </div>

      {/* topic (tag) facets */}
      <div className="mt-5 flex flex-wrap gap-2 border-b pb-4">
        <Link
          href={blogHref()}
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
            href={blogHref({ tag })}
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
            href={blogHref({ view: v, tag: tagFilter })}
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
          <CoverWall items={items} variant="og" preview={preview} />
        </div>
      ) : (
        months.map((m) => (
          <section key={m.key} className="mt-8">
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
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
                    {dateOf(t.post).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  {t.post.media?.[0]?.url ? (
                    // Dato serves a small Imgix derivative here; non-Dato
                    // sources retain their original URL and are still lazy.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={blogThumbnailUrl(t.post.media[0].url)}
                      alt=""
                      loading="lazy"
                      className="bg-muted h-9 w-14 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="bg-muted/40 h-9 w-14 shrink-0 rounded border"
                    />
                  )}
                  {!t.post.publishedAt && (
                    <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                      Draft
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{t.post.text}</span>
                  <span className="text-muted-foreground hidden shrink-0 gap-1 text-[11px] sm:flex">
                    {t.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="border-border rounded-full border px-1.5 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                  <span className="text-muted-foreground w-4 shrink-0 text-right text-xs">
                    ↗
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}

      {visible.length === 0 && (
        <p className="text-muted-foreground mt-10 text-sm">
          {selectedBrand
            ? `No articles for ${selectedBrand.name} yet. Use Sync blog above to discover its public feed.`
            : "No articles for this filter."}
        </p>
      )}
    </div>
  );
}
