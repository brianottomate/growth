import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";

import { ContentStructureAssistantButton } from "@/components/content-structure-assistant-button";
import { ClearSeriesButton } from "./ClearSeriesButton";
import { db } from "@/server/db";
import {
  brandTable,
  cadenceTargetTable,
  contentPostTable,
  memberTable,
  seriesTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { listBrandPillars } from "@/server/services/content-strategy.service";

const SERIES_STATUS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  planned: "bg-sky-500/15 text-sky-300",
  completed: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

const STATUS_ORDER: Record<string, number> = {
  active: 0,
  planned: 1,
  completed: 2,
  archived: 3,
};

const dateLabel = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });

const cadenceLabel = (target: {
  count: number;
  archetype: string;
  period: string;
  platform: string;
}) =>
  `${target.count} ${target.archetype.replaceAll("_", " ")}/${target.period} · ${target.platform}`;

export default async function SeriesPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return (
      <div className="p-8 text-muted-foreground">No organization found.</div>
    );
  }

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true },
    orderBy: (brand, { asc }) => [asc(brand.name)],
  });
  const brandIds = brands.map((brand) => brand.id);

  const series = brandIds.length
    ? await db.query.seriesTable.findMany({
        where: and(
          inArray(seriesTable.brandId, brandIds),
          isNull(seriesTable.deletedAt),
        ),
        with: {
          brand: { columns: { id: true, name: true, slug: true } },
        },
      })
    : [];
  const seriesIds = series.map((item) => item.id);

  const [installments, cadence, pillarGroups] = await Promise.all([
    seriesIds.length
      ? db.query.contentPostTable.findMany({
          where: and(
            inArray(contentPostTable.seriesId, seriesIds),
            isNotNull(contentPostTable.seriesId),
            isNull(contentPostTable.deletedAt),
          ),
          columns: {
            id: true,
            title: true,
            seriesId: true,
            status: true,
            plannedAt: true,
            targetSpots: true,
            hook: true,
            captionDirection: true,
            visualDirection: true,
            media: true,
          },
          with: {
            platformPosts: { columns: { id: true } },
          },
        })
      : [],
    seriesIds.length
      ? db.query.cadenceTargetTable.findMany({
          where: and(
            inArray(cadenceTargetTable.seriesId, seriesIds),
            eq(cadenceTargetTable.isActive, true),
            isNull(cadenceTargetTable.deletedAt),
          ),
          columns: {
            seriesId: true,
            platform: true,
            archetype: true,
            count: true,
            period: true,
          },
        })
      : [],
    Promise.all(
      brands.map(async (brand) => ({
        brandId: brand.id,
        pillars: await listBrandPillars({
          brandId: brand.id,
          brandSlug: brand.slug,
        }),
      })),
    ),
  ]);

  const now = new Date();
  const postsBySeries = new Map<string, Array<(typeof installments)[number]>>();
  for (const post of installments) {
    if (!post.seriesId) continue;
    const posts = postsBySeries.get(post.seriesId) ?? [];
    posts.push(post);
    postsBySeries.set(post.seriesId, posts);
  }
  const cadenceBySeries = new Map<string, typeof cadence>();
  for (const target of cadence) {
    if (!target.seriesId) continue;
    const targets = cadenceBySeries.get(target.seriesId) ?? [];
    targets.push(target);
    cadenceBySeries.set(target.seriesId, targets);
  }
  const pillarByKey = new Map(
    pillarGroups.flatMap((group) =>
      group.pillars.map((pillar) => [
        `${group.brandId}:${pillar.slug}`,
        pillar,
      ]),
    ),
  );
  const seriesByBrand = new Map<string, typeof series>();
  for (const item of series) {
    const items = seriesByBrand.get(item.brandId) ?? [];
    items.push(item);
    seriesByBrand.set(item.brandId, items);
  }

  const metrics = {
    active: series.filter((item) => item.status === "active").length,
    planned: series.filter((item) => item.status === "planned").length,
    installments: installments.length,
    upcoming: installments.filter(
      (post) =>
        post.plannedAt && post.plannedAt >= now && post.status !== "published",
    ).length,
  };

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Series</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Recurring editorial ideas, their publishing rhythm, and the content
            planned for each run.
          </p>
        </div>
        <span className="flex-1" />
        <Link
          href="/app/pillars"
          className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          Pillars &amp; strategy
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Active" value={metrics.active} />
        <Metric label="Planned" value={metrics.planned} />
        <Metric label="Installments" value={metrics.installments} />
        <Metric label="Upcoming" value={metrics.upcoming} />
      </div>

      {series.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed bg-card p-8">
          <h2 className="text-sm font-semibold">No series yet</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Paste a recurring-content idea or team discussion into the
            assistant. Once you agree on the shape, it can create the series and
            map the first installments here.
          </p>
        </div>
      ) : (
        brands.map((brand) => {
          const brandSeries = [...(seriesByBrand.get(brand.id) ?? [])].sort(
            (a, b) =>
              (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
              a.name.localeCompare(b.name),
          );
          if (brandSeries.length === 0) return null;

          return (
            <section key={brand.id} className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-foreground">
                  {brand.name.slice(0, 2).toUpperCase()}
                </div>
                <h2 className="text-sm font-semibold">{brand.name}</h2>
                <span className="text-xs text-muted-foreground">
                  · {brandSeries.length} series
                </span>
                <span className="flex-1" />
                <ClearSeriesButton
                  brandId={brand.id}
                  brandName={brand.name}
                  count={brandSeries.length}
                />
                <ContentStructureAssistantButton
                  brandId={brand.id}
                  brandName={brand.name}
                  source="series"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {brandSeries.map((item) => {
                  const posts = postsBySeries.get(item.id) ?? [];
                  const targets = cadenceBySeries.get(item.id) ?? [];
                  const published = posts.filter(
                    (post) => post.status === "published",
                  ).length;
                  const next = posts
                    .filter(
                      (post) =>
                        post.plannedAt &&
                        post.plannedAt >= now &&
                        post.status !== "published",
                    )
                    .sort(
                      (a, b) => a.plannedAt!.getTime() - b.plannedAt!.getTime(),
                    )[0];
                  const pillar = item.pillar
                    ? pillarByKey.get(`${item.brandId}:${item.pillar}`)
                    : undefined;
                  const accent = item.color ?? pillar?.color ?? "#64748b";
                  const progress =
                    posts.length > 0 ? (published / posts.length) * 100 : 0;
                  const orderedPosts = [...posts].sort((a, b) => {
                    if (!a.plannedAt && !b.plannedAt) return 0;
                    if (!a.plannedAt) return 1;
                    if (!b.plannedAt) return -1;
                    return a.plannedAt.getTime() - b.plannedAt.getTime();
                  });
                  const firstTwo = orderedPosts.slice(0, 2);
                  const hasDistribution =
                    firstTwo.length >= 2 &&
                    firstTwo.every(
                      (post) =>
                        post.platformPosts.length > 0 ||
                        (post.targetSpots?.length ?? 0) > 0,
                    );
                  const hasDates =
                    firstTwo.length >= 2 &&
                    firstTwo.every((post) => Boolean(post.plannedAt));
                  const hasCreativeDirection =
                    firstTwo.length >= 2 &&
                    firstTwo.every(
                      (post) =>
                        Boolean(post.hook) &&
                        Boolean(
                          post.visualDirection ??
                          post.captionDirection ??
                          (post.media?.length ? "media" : null),
                        ),
                    );
                  const mappedCount = [
                    Boolean(item.description ?? item.theme),
                    targets.length > 0,
                    posts.length >= 2,
                    hasDistribution,
                    hasDates,
                    hasCreativeDirection,
                  ].filter(Boolean).length;

                  return (
                    <Link
                      key={item.id}
                      href={`/app/series/${item.id}`}
                      className="group relative overflow-hidden rounded-xl border bg-card p-4 transition hover:border-neutral-500"
                    >
                      <span
                        className="absolute inset-y-0 left-0 w-1"
                        style={{ background: accent }}
                      />

                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-semibold">
                              {item.name}
                            </h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                                SERIES_STATUS[item.status] ??
                                SERIES_STATUS.planned
                              }`}
                            >
                              {item.status}
                            </span>
                            {pillar ? (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{
                                  background: `${pillar.color}20`,
                                  color: pillar.color,
                                }}
                              >
                                {pillar.name}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {item.description ??
                              item.theme ??
                              "The recurring promise still needs to be defined."}
                          </p>
                        </div>
                        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>
                            {published} published · {posts.length} total
                          </span>
                          <span>First-post plan {mappedCount}/6</span>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              background: accent,
                              width: `${progress}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex min-h-5 flex-wrap items-center gap-1.5">
                        {targets.slice(0, 2).map((target) => (
                          <span
                            key={`${target.platform}-${target.archetype}-${target.period}`}
                            className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {cadenceLabel(target)}
                          </span>
                        ))}
                        {targets.length > 2 ? (
                          <span className="text-[10px] text-muted-foreground">
                            +{targets.length - 2} more
                          </span>
                        ) : null}
                        {targets.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <CircleDashed className="size-3" />
                            Cadence not set
                          </span>
                        ) : mappedCount === 6 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                            <CheckCircle2 className="size-3" />
                            First posts mapped
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 border-t pt-3">
                        {next?.plannedAt ? (
                          <div className="flex items-center gap-2 text-xs">
                            <CalendarClock className="size-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Next</span>
                            <span className="min-w-0 flex-1 truncate">
                              {next.title ?? "Untitled installment"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {dateLabel(next.plannedAt)}
                            </span>
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">
                            No upcoming installment scheduled
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
