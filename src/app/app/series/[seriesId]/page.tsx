import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";

import { db } from "@/server/db";
import {
  amplificationTargetTable,
  cadenceTargetTable,
  contentPostTable,
  memberTable,
  seriesTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { listBrandPillars } from "@/server/services/content-strategy.service";

// The series lens: a read-only view over data owned by other surfaces. All
// edits happen through the side-panel chat (contentStrategyWrite /
// strategyWrite) or the content board — this page just renders the series in
// context, so it stays cheap and can't drift from the calendar.

const STATUS: Record<string, string> = {
  published: "bg-emerald-500/15 text-emerald-300",
  scheduled: "bg-sky-500/15 text-sky-300",
  approved: "bg-amber-500/15 text-amber-300",
  pending_review: "bg-amber-500/15 text-amber-300",
  slot: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

const SERIES_STATUS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  planned: "bg-sky-500/15 text-sky-300",
  completed: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d;
}

const weekLabel = (d: Date) =>
  `Wk of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

const dayLabel = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const { seriesId } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  const series = await db.query.seriesTable.findFirst({
    where: and(eq(seriesTable.id, seriesId), isNull(seriesTable.deletedAt)),
    with: { brand: true },
  });
  if (series?.brand.organizationId !== org.id) notFound();

  const now = new Date();
  const windowStart = startOfWeek(new Date(now.getTime() - 14 * 86_400_000));
  const windowEnd = new Date(startOfWeek(now).getTime() + 6 * 7 * 86_400_000);

  const [pillars, cadence, installments, contextPosts] = await Promise.all([
    listBrandPillars({ brandId: series.brandId, brandSlug: series.brand.slug }),
    db.query.cadenceTargetTable.findMany({
      where: and(
        eq(cadenceTargetTable.seriesId, series.id),
        eq(cadenceTargetTable.isActive, true),
        isNull(cadenceTargetTable.deletedAt),
      ),
      columns: { platform: true, archetype: true, count: true, period: true },
    }),
    db.query.contentPostTable.findMany({
      where: and(
        eq(contentPostTable.seriesId, series.id),
        isNull(contentPostTable.deletedAt),
      ),
      columns: {
        id: true,
        title: true,
        status: true,
        plannedAt: true,
        targetSpots: true,
        media: true,
      },
      with: {
        owner: { columns: { id: true, name: true } },
        platformPosts: {
          columns: {
            id: true,
            platform: true,
            archetype: true,
            status: true,
            text: true,
            media: true,
          },
        },
      },
      orderBy: (post, { asc }) => [asc(post.plannedAt)],
    }),
    db.query.contentPostTable.findMany({
      where: and(
        eq(contentPostTable.brandId, series.brandId),
        isNull(contentPostTable.deletedAt),
        or(
          isNull(contentPostTable.seriesId),
          ne(contentPostTable.seriesId, series.id),
        ),
        gte(contentPostTable.plannedAt, windowStart),
        lt(contentPostTable.plannedAt, windowEnd),
      ),
      columns: { id: true, title: true, status: true, plannedAt: true },
    }),
  ]);

  const pillar = series.pillar
    ? pillars.find((p) => p.slug === series.pillar)
    : undefined;

  // Amplification asks are anchored to platform posts; group them per
  // installment for the boost strip.
  const allSpotIds = installments.flatMap((post) =>
    post.platformPosts.map((spot) => spot.id),
  );
  const amplificationTargets = allSpotIds.length
    ? await db.query.amplificationTargetTable.findMany({
        where: inArray(amplificationTargetTable.platformPostId, allSpotIds),
        with: { amplifier: { columns: { name: true } } },
        columns: { id: true, platformPostId: true, ask: true },
      })
    : [];
  const spotPlatform = new Map(
    installments.flatMap((post) =>
      post.platformPosts.map((spot) => [spot.id, spot.platform] as const),
    ),
  );
  const boostsFor = (post: (typeof installments)[number]) => {
    const spotIds = new Set(post.platformPosts.map((spot) => spot.id));
    return amplificationTargets
      .filter((target) => spotIds.has(target.platformPostId))
      .map((target) => ({
        id: target.id,
        name: target.amplifier.name,
        platform: spotPlatform.get(target.platformPostId) ?? "",
        ask: target.ask,
      }));
  };

  type WeekBucket = {
    start: Date;
    installments: typeof installments;
    context: typeof contextPosts;
  };
  const weeks = new Map<number, WeekBucket>();
  const unscheduled: typeof installments = [];
  const bucketFor = (date: Date): WeekBucket => {
    const key = startOfWeek(date).getTime();
    let bucket = weeks.get(key);
    if (!bucket) {
      bucket = { start: new Date(key), installments: [], context: [] };
      weeks.set(key, bucket);
    }
    return bucket;
  };
  for (const post of installments) {
    if (!post.plannedAt) unscheduled.push(post);
    else bucketFor(post.plannedAt).installments.push(post);
  }
  for (const post of contextPosts) {
    if (post.plannedAt) bucketFor(post.plannedAt).context.push(post);
  }
  const orderedWeeks = [...weeks.values()]
    .filter((week) => week.installments.length > 0 || week.context.length > 0)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Prefer the real platform_post rows; fall back to the targetSpots intent
  // manifest for ideas whose spots haven't materialized yet. Thumbnails read
  // the spot's own media first, then the idea's shared media pool — same
  // fallback SpotCard uses (m.thumbnail ?? m.url).
  const spotsFor = (post: (typeof installments)[number]) => {
    const poolThumb = post.media?.[0]
      ? (post.media[0].thumbnail ?? post.media[0].url)
      : null;
    return post.platformPosts.length > 0
      ? post.platformPosts.map((spot) => ({
          id: spot.id,
          platform: spot.platform,
          archetype: spot.archetype,
          status: spot.status,
          text: spot.text,
          thumb: spot.media?.[0]
            ? (spot.media[0].thumbnail ?? spot.media[0].url)
            : poolThumb,
        }))
      : (post.targetSpots ?? []).map((spot, index) => ({
          id: `target-${index}`,
          platform: spot.platform,
          archetype: spot.archetype ?? null,
          status: "slot",
          text: null,
          thumb: poolThumb,
        }));
  };

  return (
    <div>
      <div className="text-muted-foreground text-xs">
        <Link href="/app/pillars" className="hover:underline">
          Pillars &amp; strategy
        </Link>{" "}
        / {series.brand.name}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {series.name}
        </h1>
        {pillar ? (
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{ background: `${pillar.color}26`, color: pillar.color }}
          >
            {pillar.name}
          </span>
        ) : null}
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
            SERIES_STATUS[series.status] ?? SERIES_STATUS.planned
          }`}
        >
          {series.status}
        </span>
        <span className="flex-1" />
        {cadence.map((target) => (
          <span
            key={`${target.platform}-${target.archetype}`}
            className="text-muted-foreground rounded-full border px-2.5 py-0.5 text-[11px] tabular-nums"
          >
            {target.count} {target.archetype.replace("_", " ")}/
            {target.period} · {target.platform}
          </span>
        ))}
      </div>

      {series.description ? (
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-relaxed">
          {series.description}
        </p>
      ) : null}

      {unscheduled.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Unscheduled
          </h2>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {unscheduled.map((post) => (
              <InstallmentCard
                key={post.id}
                post={post}
                spots={spotsFor(post)}
                boosts={boostsFor(post)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <div className="flex items-center gap-2">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Timeline
          </h2>
          <span className="text-muted-foreground text-[11px]">
            other {series.brand.name} posts dimmed
          </span>
          <span className="flex-1" />
          <Link
            href="/app/calendar"
            className="text-muted-foreground text-[11px] hover:underline"
          >
            Open calendar →
          </Link>
        </div>

        {orderedWeeks.length === 0 ? (
          <div className="bg-card mt-3 rounded-xl border p-6 text-sm">
            <p className="font-medium">No installments yet</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Ask the assistant to add an installment or set a series cadence,
              then generate slots from the content board.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {orderedWeeks.map((week) => (
              <div key={week.start.getTime()} className="flex gap-4">
                <div className="text-muted-foreground w-24 shrink-0 pt-3 text-[11px] tabular-nums">
                  {weekLabel(week.start)}
                </div>
                <div className="min-w-0 flex-1 space-y-2 border-l pl-4">
                  {week.installments.map((post) => (
                    <InstallmentCard
                      key={post.id}
                      post={post}
                      spots={spotsFor(post)}
                      boosts={boostsFor(post)}
                    />
                  ))}
                  {week.context.slice(0, 3).map((post) => (
                    <Link
                      key={post.id}
                      href={`/app/content/${post.id}`}
                      className="block rounded-lg border border-transparent px-3 py-2 opacity-45 transition hover:opacity-80"
                    >
                      <span className="text-xs">
                        {post.title ?? "Untitled"}
                      </span>
                      <span className="text-muted-foreground ml-2 text-[11px]">
                        {post.plannedAt ? dayLabel(post.plannedAt) : null}
                      </span>
                    </Link>
                  ))}
                  {week.context.length > 3 ? (
                    <p className="text-muted-foreground px-3 text-[11px]">
                      +{week.context.length - 3} more on the calendar
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-muted-foreground mt-8 text-[11px]">
        Edit this series from the assistant panel — cadence, installments, and
        pillar changes land here live.
      </p>
    </div>
  );
}

type SpotPreview = {
  id: string;
  platform: string;
  archetype: string | null;
  status: string;
  text: string | null;
  thumb: string | null;
};

const SPOT_DOT: Record<string, string> = {
  published: "bg-emerald-400",
  scheduled: "bg-sky-400",
  approved: "bg-amber-400",
  pending_review: "bg-amber-400",
  draft: "bg-neutral-500",
  slot: "bg-neutral-600",
};

// One tile per platform post. Filled = thumbnail or copy snippet; empty =
// dashed placeholder. Emptiness is the only "gap" signal on this page —
// deliberate: cadence is inspiration, not a scorecard.
function SpotTile({ spot }: { spot: SpotPreview }) {
  const filled = Boolean(spot.thumb ?? spot.text);
  const label = `${spot.platform}${
    spot.archetype && spot.archetype !== "article"
      ? ` · ${spot.archetype.replace("_", " ")}`
      : ""
  }`;
  return (
    <div
      className={`w-28 shrink-0 overflow-hidden rounded-md border ${
        filled ? "bg-background" : "border-dashed opacity-70"
      }`}
      title={`${label} · ${spot.status.replace("_", " ")}`}
    >
      <div className="h-14">
        {spot.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spot.thumb}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : spot.text ? (
          <p className="text-muted-foreground line-clamp-3 px-1.5 py-1 text-[9px] leading-tight">
            {spot.text}
          </p>
        ) : (
          <div className="text-muted-foreground/60 flex h-full items-center justify-center text-[10px]">
            empty
          </div>
        )}
      </div>
      <div className="text-muted-foreground flex items-center gap-1 border-t px-1.5 py-0.5 text-[9px]">
        <span
          className={`size-1.5 shrink-0 rounded-full ${
            SPOT_DOT[spot.status] ?? SPOT_DOT.draft
          }`}
        />
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}

type Boost = {
  id: string;
  name: string;
  platform: string;
  ask: string;
};

const ASK_DOT: Record<string, string> = {
  planned: "bg-neutral-500",
  asked: "bg-amber-400",
  confirmed: "bg-sky-400",
  fulfilled: "bg-emerald-400",
};

function InstallmentCard({
  post,
  spots,
  boosts,
}: {
  post: {
    id: string;
    title: string | null;
    status: string;
    plannedAt: Date | null;
    owner?: { id: string; name: string | null } | null;
  };
  spots: SpotPreview[];
  boosts: Boost[];
}) {
  return (
    <Link
      href={`/app/content/${post.id}`}
      className="bg-card block rounded-lg border px-3 py-2 transition hover:border-neutral-500"
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">
          {post.title ?? "Untitled"}
        </span>
        <span className="flex-1" />
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
            STATUS[post.status] ?? STATUS.draft
          }`}
        >
          {post.status.replace("_", " ")}
        </span>
      </div>
      <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
        {post.plannedAt ? <span>{dayLabel(post.plannedAt)}</span> : null}
        {post.owner?.name ? <span>· {post.owner.name}</span> : null}
      </div>
      {spots.length > 0 ? (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {spots.map((spot) => (
            <SpotTile key={spot.id} spot={spot} />
          ))}
        </div>
      ) : null}
      {boosts.length > 0 ? (
        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="text-muted-foreground/70">Boost</span>
          {boosts.map((boost) => (
            <span
              key={boost.id}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
              title={`${boost.platform} · ${boost.ask}`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  ASK_DOT[boost.ask] ?? ASK_DOT.planned
                }`}
              />
              {boost.name} · {boost.platform}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
