import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable, platformPostTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import {
  NEWSLETTER_KIND_META,
  newsletterKind,
  type NewsletterKind,
} from "@/lib/newsletter-kind";
import { CoverWall, DocumentReader, type CoverItem } from "@/components/cover-wall";
import { fetchNewsletterContent } from "@/server/clients/cio-content";

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;
const pct = (num: number, den: number) =>
  den > 0 ? `${Math.round((num / den) * 100)}%` : "—";
const monthKey = (d: Date) =>
  d.toLocaleDateString([], { month: "long", year: "numeric" });

export default async function NewslettersPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; view?: string }>;
}) {
  const { kind: kindFilter, view: viewParam } = await searchParams;
  const view: "list" | "wall" | "read" =
    viewParam === "wall" || viewParam === "read" ? viewParam : "list";
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

  const issues = brandIds.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, brandIds),
          eq(platformPostTable.externalKind, "broadcast"),
          isNotNull(platformPostTable.publishedAt),
        ),
        orderBy: [desc(platformPostTable.publishedAt)],
      })
    : [];

  // Tag each issue with its kind + open rate.
  const tagged = issues.map((i) => {
    const kind = newsletterKind(i.text ?? "");
    const s = i.stats;
    return { issue: i, kind, openRate: s?.delivered ? (s.opened ?? 0) / s.delivered : null };
  });

  // Kinds overview.
  const kindAgg = new Map<
    NewsletterKind,
    { count: number; reach: number; openSum: number; openN: number }
  >();
  for (const t of tagged) {
    const a = kindAgg.get(t.kind) ?? { count: 0, reach: 0, openSum: 0, openN: 0 };
    a.count++;
    a.reach += t.issue.stats?.sent ?? 0;
    if (t.openRate != null) {
      a.openSum += t.openRate;
      a.openN++;
    }
    kindAgg.set(t.kind, a);
  }
  const kindCards = [...kindAgg.entries()].sort((a, b) => b[1].count - a[1].count);

  const visible = kindFilter
    ? tagged.filter((t) => t.kind === kindFilter)
    : tagged;

  const totalReach = tagged.reduce((n, t) => n + (t.issue.stats?.sent ?? 0), 0);
  const openRates = tagged.filter((t) => t.openRate != null);
  const avgOpen =
    openRates.length > 0
      ? openRates.reduce((n, t) => n + (t.openRate ?? 0), 0) / openRates.length
      : null;

  // Wall / Reader: fetch rendered bodies for a bounded set (live, render-time).
  const cap = view === "wall" ? 24 : 10;
  const truncated = view !== "list" && visible.length > cap;
  const previews: CoverItem[] =
    view === "list"
      ? []
      : await Promise.all(
          visible.slice(0, cap).map(async (t) => {
            const c = t.issue.externalId
              ? await fetchNewsletterContent(t.issue.externalId)
              : null;
            const meta = NEWSLETTER_KIND_META[t.kind];
            return {
              id: t.issue.id,
              href: `/app/newsletters/${t.issue.id}`,
              title: c?.subject ?? t.issue.text ?? "Untitled",
              date: t.issue.publishedAt!.toLocaleDateString([], {
                month: "short",
                day: "numeric",
              }),
              badge: { label: meta.label, color: meta.color },
              stat:
                t.openRate != null
                  ? `${Math.round(t.openRate * 100)}% open`
                  : undefined,
              html: c?.body ?? null,
            } satisfies CoverItem;
          }),
        );

  // Group visible issues by month.
  const months: { key: string; items: typeof visible }[] = [];
  for (const t of visible) {
    const k = monthKey(t.issue.publishedAt!);
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
          <h1 className="text-2xl font-semibold tracking-tight">Newsletters</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {tagged.length} issues · {fmt(totalReach)} reached ·{" "}
            {avgOpen != null ? `${Math.round(avgOpen * 100)}%` : "—"} avg open ·
            via Customer.io
          </p>
        </div>
      </div>

      {/* Kinds overview */}
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Link
          href="/app/newsletters"
          className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
            !kindFilter ? "border-foreground bg-accent/40" : "hover:bg-accent/40"
          }`}
        >
          <div className="font-semibold">All</div>
          <div className="text-muted-foreground">{tagged.length} issues</div>
        </Link>
        {kindCards.map(([kind, a]) => {
          const meta = NEWSLETTER_KIND_META[kind];
          const active = kindFilter === kind;
          return (
            <Link
              key={kind}
              href={`/app/newsletters?kind=${kind}`}
              className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
                active ? "border-foreground bg-accent/40" : "hover:bg-accent/40"
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: meta.color }}
                />
                {meta.label}
              </div>
              <div className="text-muted-foreground mt-0.5">
                {a.count} · {meta.cadence}
              </div>
              <div className="text-muted-foreground tabular-nums">
                {fmt(a.reach)} reach ·{" "}
                {a.openN ? `${Math.round((a.openSum / a.openN) * 100)}%` : "—"} open
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-muted-foreground/70 mt-3 text-xs">
        Topics (General · Destinations · Location Recommendations) — coming soon,
        from Customer.io subscription topics.
      </p>

      {/* view toggle */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        {(["list", "wall", "read"] as const).map((v) => (
          <Link
            key={v}
            href={`/app/newsletters?view=${v}${kindFilter ? `&kind=${kindFilter}` : ""}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
              view === v
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {v === "read" ? "Read" : v}
          </Link>
        ))}
        {truncated && (
          <span className="text-muted-foreground text-xs">
            showing latest {cap} of {visible.length}
          </span>
        )}
      </div>

      {view === "wall" && (
        <div className="mt-6">
          <CoverWall items={previews} />
        </div>
      )}
      {view === "read" && (
        <div className="mt-6">
          <DocumentReader items={previews} />
        </div>
      )}

      {/* Chronological issues (list) */}
      {view === "list" &&
        months.map((m) => (
        <section key={m.key} className="mt-8">
          <h2 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
            {m.key} · {m.items.length}
          </h2>
          <div className="flex flex-col">
            {m.items.map(({ issue, kind, openRate }) => {
              const meta = NEWSLETTER_KIND_META[kind];
              const s = issue.stats;
              return (
                <Link
                  key={issue.id}
                  href={`/app/newsletters/${issue.id}`}
                  className="hover:bg-accent/40 -mx-2 flex items-center gap-3 rounded-lg border-b px-2 py-3 text-sm transition-colors last:border-0"
                >
                  <span className="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">
                    {issue.publishedAt!.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: meta.color }}
                    title={meta.label}
                  />
                  <span className="min-w-0 flex-1 truncate">{issue.text}</span>
                  <span className="text-muted-foreground hidden w-28 shrink-0 text-right text-xs tabular-nums sm:block">
                    {s?.sent ? `${fmt(s.sent)} sent` : "—"}
                  </span>
                  <span className="text-muted-foreground w-16 shrink-0 text-right text-xs tabular-nums">
                    {openRate != null ? pct(s?.opened ?? 0, s?.delivered ?? 0) : "—"}
                  </span>
                  <span className="text-muted-foreground/60 w-4 shrink-0 text-right text-xs">
                    ↗
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {visible.length === 0 && (
        <p className="text-muted-foreground mt-10 text-sm">No issues for this filter.</p>
      )}
    </div>
  );
}
