import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRight,
  Building2,
  FileStack,
  GalleryVerticalEnd,
  Radio,
  Target,
} from "lucide-react";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import {
  personaTable,
  brandInspirationTable,
  brandTable,
  channelSuggestionTable,
  contentSuggestionTable,
  mediaAssetTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";

export const dynamic = "force-dynamic";

type ReviewItem = {
  title: string;
  description: string;
  href: string;
  icon: typeof FileStack;
  total: number;
  byBrand: { name: string; count: number }[];
  kind: "decision" | "gap";
};

function byBrand(
  brandIds: string[],
  names: Map<string, string>,
  rows: { brandId: string }[],
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.brandId, (counts.get(row.brandId) ?? 0) + 1);
  }
  return brandIds
    .map((id) => ({
      name: names.get(id) ?? "Brand",
      count: counts.get(id) ?? 0,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="group rounded-xl border bg-card p-4 transition-colors hover:border-foreground/25"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 grid-cols-1 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{item.title}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {item.total}
            </span>
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {item.description}
          </span>
          {item.byBrand.length > 0 && (
            <span className="mt-3 flex flex-wrap gap-1.5">
              {item.byBrand.map((brand) => (
                <span
                  key={brand.name}
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  {brand.name} · {brand.count}
                </span>
              ))}
            </span>
          )}
        </span>
        <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export default async function ReviewPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true },
    orderBy: (table, { asc }) => [asc(table.name)],
  });
  const brandIds = brands.map((brand) => brand.id);
  const names = new Map(brands.map((brand) => [brand.id, brand.name]));

  if (brandIds.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold">Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a brand before the assistant can propose structure for review.
        </p>
      </div>
    );
  }

  const inspirationLinks = await db.query.brandInspirationTable.findMany({
    where: inArray(brandInspirationTable.brandId, brandIds),
    columns: { inspirationBrandId: true },
  });
  const trackedIds = [
    ...new Set(inspirationLinks.map((link) => link.inspirationBrandId)),
  ];
  const trackedBrands = trackedIds.length
    ? await db.query.brandTable.findMany({
        where: inArray(brandTable.id, trackedIds),
        columns: { id: true, name: true },
      })
    : [];
  const reviewBrandIds = [...brandIds, ...trackedIds];
  const reviewNames = new Map([
    ...names,
    ...trackedBrands.map((brand) => [brand.id, brand.name] as const),
  ]);

  const [
    groupingSuggestions,
    contentSuggestions,
    channelSuggestions,
    ownedPosts,
    mediaAssets,
    personas,
  ] = await Promise.all([
    db.query.contentSuggestionTable.findMany({
      where: and(
        inArray(contentSuggestionTable.brandId, brandIds),
        eq(contentSuggestionTable.kind, "grouping"),
        eq(contentSuggestionTable.status, "pending"),
      ),
      columns: { brandId: true },
    }),
    db.query.contentSuggestionTable.findMany({
      where: and(
        inArray(contentSuggestionTable.brandId, reviewBrandIds),
        inArray(contentSuggestionTable.kind, [
          "classification",
          "amplification",
          "cross_link",
          "thread",
        ]),
        eq(contentSuggestionTable.status, "pending"),
      ),
      columns: { brandId: true },
    }),
    db.query.channelSuggestionTable.findMany({
      where: and(
        inArray(channelSuggestionTable.brandId, brandIds),
        eq(channelSuggestionTable.status, "pending"),
      ),
      columns: { brandId: true },
    }),
    db.query.platformPostTable.findMany({
      where: and(
        inArray(platformPostTable.brandId, brandIds),
        eq(platformPostTable.source, "owned"),
      ),
      columns: {
        brandId: true,
        contentPostId: true,
        archetype: true,
      },
    }),
    db.query.mediaAssetTable.findMany({
      where: and(
        inArray(mediaAssetTable.brandId, brandIds),
        eq(mediaAssetTable.kind, "image"),
        eq(mediaAssetTable.status, "ready"),
        isNull(mediaAssetTable.deletedAt),
      ),
      columns: { brandId: true, metadata: true },
    }),
    db.query.personaTable.findMany({
      where: and(
        inArray(personaTable.brandId, brandIds),
        isNull(personaTable.deletedAt),
      ),
      columns: { brandId: true },
    }),
  ]);

  const unmappedPosts = ownedPosts.filter((post) => !post.contentPostId);
  const unclassifiedPosts = ownedPosts.filter((post) => !post.archetype);
  const unanalysedMedia = mediaAssets.filter((asset) => {
    const metadata = asset.metadata;
    return !(
      metadata &&
      typeof metadata === "object" &&
      "aiAnalysis" in metadata
    );
  });
  const brandsWithoutAudiences = brands
    .filter((brand) => !personas.some((row) => row.brandId === brand.id))
    .map((brand) => ({ brandId: brand.id }));

  const decisions: ReviewItem[] = [
    {
      title: "Content groupings",
      description:
        "Confirm whether published posts are one cross-channel idea or distinct pieces in a recurring series.",
      href: "/app/content/groupings",
      icon: FileStack,
      total: groupingSuggestions.length,
      byBrand: byBrand(brandIds, names, groupingSuggestions),
      kind: "decision",
    },
    {
      title: "Content suggestions",
      description:
        "Review proposed classifications and amplification links before they change the confirmed content graph.",
      href: "/app/content/suggestions",
      icon: FileStack,
      total: contentSuggestions.length,
      byBrand: byBrand(reviewBrandIds, reviewNames, contentSuggestions),
      kind: "decision",
    },
    {
      title: "Discovered channels",
      description:
        "Confirm public profiles before they become part of the brand's channel map.",
      href: "/app/brands",
      icon: Radio,
      total: channelSuggestions.length,
      byBrand: byBrand(brandIds, names, channelSuggestions),
      kind: "decision",
    },
  ];

  const gaps: ReviewItem[] = [
    {
      title: "Unmapped content",
      description:
        "Owned posts that still lack a canonical content idea and cannot yet inform series or planning cleanly.",
      href: "/app/feed-v5",
      icon: FileStack,
      total: unmappedPosts.length,
      byBrand: byBrand(brandIds, names, unmappedPosts),
      kind: "gap",
    },
    {
      title: "Unclassified content",
      description:
        "Posts missing a format/archetype, weakening cadence comparisons and future slot generation.",
      href: "/app/feed-v5",
      icon: Building2,
      total: unclassifiedPosts.length,
      byBrand: byBrand(brandIds, names, unclassifiedPosts),
      kind: "gap",
    },
    {
      title: "Media awaiting analysis",
      description:
        "Ready images without a literal AI description and managed-vocabulary tag pass.",
      href: "/app/media",
      icon: GalleryVerticalEnd,
      total: unanalysedMedia.length,
      byBrand: byBrand(brandIds, names, unanalysedMedia),
      kind: "gap",
    },
    {
      title: "Persona gaps",
      description:
        "Owned brands with no personas yet — nothing says who their content and campaigns are for.",
      href: "/app/audiences",
      icon: Target,
      total: brandsWithoutAudiences.length,
      byBrand: byBrand(brandIds, names, brandsWithoutAudiences),
      kind: "gap",
    },
  ];

  const decisionTotal = decisions.reduce((sum, item) => sum + item.total, 0);
  const gapTotal = gaps.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Human decisions and missing structure across the brand map. Confirm AI
          proposals first; then improve the gaps that limit planning context.
        </p>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">
            Decisions · {decisionTotal}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            AI-proposed changes that will not alter the confirmed map until a
            human reviews them.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
          {decisions.map((item) => (
            <ReviewCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">
            Structural gaps · {gapTotal}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Raw material the assistant can see but cannot yet use as strong,
            confirmed planning context.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
          {gaps.map((item) => (
            <ReviewCard key={item.title} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
