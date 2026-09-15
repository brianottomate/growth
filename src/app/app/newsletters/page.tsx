import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandInspirationTable,
  brandTable,
  channelTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import {
  NEWSLETTER_KIND_META,
  newsletterKind,
  type NewsletterKind,
} from "@/lib/newsletter-kind";
import { inspirationAddress } from "@/lib/inbound-email";
import {
  CoverWall,
  DocumentReader,
  type CoverItem,
} from "@/components/cover-wall";
import { BrandFilterSelect } from "@/components/brand-filter-select";
import { fetchNewsletterContent } from "@/server/clients/cio-content";
import {
  CompetitorNewsletters,
  type CompetitorNewsletterRow,
} from "./CompetitorNewsletters";
import { NewsletterChatStart } from "./NewsletterChatStart";

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;
const pct = (num: number, den: number) =>
  den > 0 ? `${Math.round((num / den) * 100)}%` : "—";
const monthKey = (d: Date) =>
  d.toLocaleDateString([], { month: "long", year: "numeric" });

export default async function NewslettersPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; view?: string; brand?: string }>;
}) {
  const {
    kind: kindFilter,
    view: viewParam,
    brand: brandParam,
  } = await searchParams;
  const view: "list" | "wall" | "read" =
    viewParam === "wall" || viewParam === "read" ? viewParam : "list";
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
  });
  const selectedBrand = brandParam
    ? (brands.find((brand) => brand.slug === brandParam) ?? null)
    : null;
  const brandIds = selectedBrand
    ? [selectedBrand.id]
    : brands.map((brand) => brand.id);
  const newsletterHref = (input?: {
    kind?: string;
    view?: "list" | "wall" | "read";
  }) => {
    const params = new URLSearchParams();
    if (selectedBrand?.slug) params.set("brand", selectedBrand.slug);
    if (input?.kind) params.set("kind", input.kind);
    if (input?.view) params.set("view", input.view);
    const query = params.toString();
    return query ? `/app/newsletters?${query}` : "/app/newsletters";
  };

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

  const ownedEmails = brandIds.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, brandIds),
          eq(platformPostTable.source, "owned"),
          eq(platformPostTable.platform, "newsletter"),
          inArray(platformPostTable.format, [
            "newsletter.broadcast",
            "newsletter.blast",
          ]),
        ),
        with: { contentPost: true },
        orderBy: [
          desc(platformPostTable.scheduledAt),
          desc(platformPostTable.updatedAt),
        ],
      })
    : [];
  const emailBuckets = [
    {
      label: "Slots",
      description: "Seeded premises waiting for individual drafting",
      items: ownedEmails.filter((email) => email.status === "slot"),
    },
    {
      label: "Drafts",
      description: "Authored issues without a content-calendar date",
      items: ownedEmails.filter(
        (email) =>
          email.status !== "slot" &&
          email.status !== "published" &&
          !email.scheduledAt,
      ),
    },
    {
      label: "Planned",
      description: "Attached to the Wander Growth content calendar",
      items: ownedEmails.filter(
        (email) =>
          email.status !== "slot" &&
          email.status !== "published" &&
          Boolean(email.scheduledAt),
      ),
    },
  ].filter((bucket) => bucket.items.length > 0);

  // ---- Competitor newsletters (forwarded via inspo+<brandId>@) ----
  // The reference brands our owned brands track, their newsletter-capture
  // channel (if provisioned), and the issues forwarded in so far.
  const inspirations = brandIds.length
    ? await db.query.brandInspirationTable.findMany({
        where: inArray(brandInspirationTable.brandId, brandIds),
      })
    : [];
  const refBrandIds = [
    ...new Set(inspirations.map((i) => i.inspirationBrandId)),
  ];
  const refBrands = refBrandIds.length
    ? await db.query.brandTable.findMany({
        where: and(
          inArray(brandTable.id, refBrandIds),
          isNull(brandTable.deletedAt),
        ),
      })
    : [];
  const nlChannels = refBrandIds.length
    ? await db.query.channelTable.findMany({
        where: and(
          inArray(channelTable.brandId, refBrandIds),
          eq(channelTable.kind, "newsletter"),
          isNull(channelTable.deletedAt),
        ),
      })
    : [];
  const trackedSet = new Set(nlChannels.map((c) => c.brandId));
  const refIssues = refBrandIds.length
    ? await db.query.platformPostTable.findMany({
        where: and(
          inArray(platformPostTable.brandId, refBrandIds),
          eq(platformPostTable.externalKind, "broadcast"),
        ),
        orderBy: [desc(platformPostTable.publishedAt)],
      })
    : [];
  const competitorRows: CompetitorNewsletterRow[] = refBrands
    .map((b) => {
      const bIssues = refIssues.filter((i) => i.brandId === b.id);
      return {
        brandId: b.id,
        name: b.name,
        logo: b.logo,
        website: b.website,
        tracked: trackedSet.has(b.id),
        address: inspirationAddress(b.id),
        issueCount: bIssues.length,
        lastReceivedAt: bIssues[0]?.publishedAt?.toISOString() ?? null,
        recentIssues: bIssues.slice(0, 3).map((i) => ({
          id: i.id,
          subject: i.text ?? "Untitled",
          receivedAt: i.publishedAt?.toISOString() ?? "",
          url: i.externalUrl ?? null,
          themes:
            (i.metadata as { inspiration?: { themes?: string[] } } | null)
              ?.inspiration?.themes ?? [],
        })),
      };
    })
    .sort(
      (a, b) =>
        Number(b.tracked) - Number(a.tracked) || b.issueCount - a.issueCount,
    );

  // Tag each issue with its kind + open rate.
  const tagged = issues.map((i) => {
    const kind = newsletterKind(i.text ?? "");
    const s = i.stats;
    return {
      issue: i,
      kind,
      openRate: s?.delivered ? (s.opened ?? 0) / s.delivered : null,
    };
  });

  // Kinds overview.
  const kindAgg = new Map<
    NewsletterKind,
    { count: number; reach: number; openSum: number; openN: number }
  >();
  for (const t of tagged) {
    const a = kindAgg.get(t.kind) ?? {
      count: 0,
      reach: 0,
      openSum: 0,
      openN: 0,
    };
    a.count++;
    a.reach += t.issue.stats?.sent ?? 0;
    if (t.openRate != null) {
      a.openSum += t.openRate;
      a.openN++;
    }
    kindAgg.set(t.kind, a);
  }
  const kindCards = [...kindAgg.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  );

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Newsletters</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ownedEmails.filter((email) => email.status !== "published").length}{" "}
            in editorial production · {tagged.length} sent issues ·{" "}
            {fmt(totalReach)} reached ·{" "}
            {avgOpen != null ? `${Math.round(avgOpen * 100)}%` : "—"} avg open ·
            delivery history
            {selectedBrand ? ` · ${selectedBrand.name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NewsletterChatStart
            brandId={selectedBrand?.id}
            brandName={selectedBrand?.name}
          />
          <BrandFilterSelect
            brands={brands.flatMap((brand) =>
              brand.slug ? [{ slug: brand.slug, name: brand.name }] : [],
            )}
          />
        </div>
      </div>

      {emailBuckets.length > 0 && (
        <section className="mt-6 rounded-2xl border p-4">
          <div>
            <h2 className="font-semibold">Editorial pipeline</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Broadcasts and blasts share the same authoring workspace. Only
              recurring broadcasts count toward newsletter cadence.
            </p>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {emailBuckets.map((bucket) => (
              <div key={bucket.label}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold tracking-wide uppercase">
                      {bucket.label} · {bucket.items.length}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {bucket.description}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {bucket.items.map((email) => (
                    <Link
                      key={email.id}
                      href={`/app/newsletters/${email.id}`}
                      className="block rounded-lg border p-3 transition-colors hover:bg-accent/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {email.contentPost?.title ||
                            email.text ||
                            "Untitled email"}
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {email.format === "newsletter.blast"
                            ? "Blast"
                            : "Issue"}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {email.scheduledAt
                          ? email.scheduledAt.toLocaleString()
                          : "No calendar date"}
                        {email.contentPost?.seriesId ? " · Series" : ""}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Kinds overview */}
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Link
          href={newsletterHref()}
          className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
            !kindFilter
              ? "border-foreground bg-accent/40"
              : "hover:bg-accent/40"
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
              href={newsletterHref({ kind })}
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
              <div className="mt-0.5 text-muted-foreground">
                {a.count} · {meta.cadence}
              </div>
              <div className="text-muted-foreground tabular-nums">
                {fmt(a.reach)} reach ·{" "}
                {a.openN ? `${Math.round((a.openSum / a.openN) * 100)}%` : "—"}{" "}
                open
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Topics (General · Destinations · Location Recommendations) — coming
        soon, from Customer.io subscription topics.
      </p>

      {/* view toggle */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        {(["list", "wall", "read"] as const).map((v) => (
          <Link
            key={v}
            href={newsletterHref({ view: v, kind: kindFilter })}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
              view === v
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {v === "read" ? "Read" : v}
          </Link>
        ))}
        {truncated && (
          <span className="text-xs text-muted-foreground">
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
            <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
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
                    className="-mx-2 flex items-center gap-3 rounded-lg border-b px-2 py-3 text-sm transition-colors last:border-0 hover:bg-accent/40"
                  >
                    <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
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
                    <span className="min-w-0 flex-1 truncate">
                      {issue.text}
                    </span>
                    <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">
                      {s?.sent ? `${fmt(s.sent)} sent` : "—"}
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {openRate != null
                        ? pct(s?.opened ?? 0, s?.delivered ?? 0)
                        : "—"}
                    </span>
                    <span className="w-4 shrink-0 text-right text-xs text-muted-foreground">
                      ↗
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

      {visible.length === 0 && (
        <p className="mt-10 text-sm text-muted-foreground">
          No issues for this filter.
        </p>
      )}

      <CompetitorNewsletters rows={competitorRows} />
    </div>
  );
}
