import type { ReactNode } from "react";
import { MailCheck } from "lucide-react";
import { WorkspaceCard } from "@/app/app/performance/WorkspaceCard";
import { EmptyState } from "@/components/ui/empty-state";
import { EmailDraftsCard } from "./EmailDraftsCard";
import { BrandEmailStyle } from "./BrandEmailStyle";
import Link from "next/link";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  platformPostTable,
  platformDocumentTable,
  productionPacketTable,
  emailSequenceTable,
  emailSequenceStepTable,
} from "@/server/db/schema";
import { NEWSLETTER_TEMPLATES } from "@/lib/newsletter-templates";
import {
  NEWSLETTER_KIND_META,
  newsletterKind,
  type NewsletterKind,
} from "@/lib/newsletter-kind";
import {
  CoverWall,
  DocumentReader,
  type CoverItem,
} from "@/components/cover-wall";
import { BrandPagePicker } from "./BrandPagePicker";
import { fetchNewsletterContent } from "@/server/clients/cio-content";
import { NewsletterCapture } from "./NewsletterCapture";

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;
const pct = (num: number, den: number) =>
  den > 0 ? `${Math.round((num / den) * 100)}%` : "—";
const monthKey = (d: Date) =>
  d.toLocaleDateString([], { month: "long", year: "numeric" });

type ViewBrand = { id: string; name: string; slug: string | null };

/**
 * The newsletters page for a set of brands: the editorial pipeline, the sent
 * history with its kinds and open rates, and the competitor issues those
 * brands track. `/app/newsletters` shows every brand in the organization;
 * `/app/brands/[slug]/newsletters` shows one, so everything on it (links,
 * the chat that plans an issue) already knows the brand.
 */
export async function NewslettersView({
  brands,
  brand,
  basePath,
  kindFilter,
  view,
  audiencesCard,
  settingsCard,
  showCapture = true,
  seriesId,
  editionActions,
  editionIntro,
  editionTitle,
  editionSwitcher,
}: {
  /** Every brand in the organization, for the overview's brand picker. */
  brands: ViewBrand[];
  /** The one brand this page is for; null on the overview. */
  brand: ViewBrand | null;
  /** Where this page lives, for its own filter and view links. */
  basePath: string;
  kindFilter?: string;
  view: "list" | "wall" | "read";
  audiencesCard?: ReactNode;
  settingsCard?: ReactNode;
  showCapture?: boolean;
  seriesId?: string;
  editionActions?: ReactNode;
  editionIntro?: ReactNode;
  editionTitle?: string;
  editionSwitcher?: ReactNode;
}) {
  const selectedBrand = brand;
  const emailIdentity = brand
    ? await db.query.brandTable.findFirst({
        where: eq(brandTable.id, brand.id),
        columns: { emailSender: true },
      })
    : null;
  const brandIds = brand ? [brand.id] : brands.map((row) => row.id);
  const newsletterHref = (input?: {
    kind?: string;
    view?: "list" | "wall" | "read";
  }) => {
    const params = new URLSearchParams();
    if (input?.kind) params.set("kind", input.kind);
    if (input?.view) params.set("view", input.view);
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
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
  const emailIds = ownedEmails.map((email) => email.id);
  const [documents, sequenceSteps] = emailIds.length
    ? await Promise.all([
        db
          .select({
            id: platformDocumentTable.platformPostId,
            document: productionPacketTable.document,
          })
          .from(platformDocumentTable)
          .innerJoin(
            productionPacketTable,
            eq(productionPacketTable.id, platformDocumentTable.documentId),
          )
          .where(
            and(
              inArray(platformDocumentTable.platformPostId, emailIds),
              inArray(productionPacketTable.brandId, brandIds),
            ),
          ),
        db
          .select({
            id: emailSequenceStepTable.platformPostId,
            name: emailSequenceTable.name,
            position: emailSequenceStepTable.position,
          })
          .from(emailSequenceStepTable)
          .innerJoin(
            emailSequenceTable,
            eq(emailSequenceTable.id, emailSequenceStepTable.sequenceId),
          )
          .where(
            and(
              inArray(emailSequenceStepTable.platformPostId, emailIds),
              inArray(emailSequenceTable.brandId, brandIds),
              isNull(emailSequenceTable.deletedAt),
            ),
          ),
      ])
    : [[], []];
  const documentByEmail = new Map(
    documents.map((row) => [
      row.id,
      row.document.type === "email" ? row.document.content : null,
    ]),
  );
  const sequencesByEmail = new Map<string, string[]>();
  for (const step of sequenceSteps) {
    if (!step.id) continue;
    const memberships = sequencesByEmail.get(step.id) ?? [];
    memberships.push(`${step.name} · Step ${step.position + 1}`);
    sequencesByEmail.set(step.id, memberships);
  }
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
    <div className="space-y-4">
      {!basePath.startsWith("/app/performance/clients/") && (
        <h1 className="text-2xl font-semibold">
          {selectedBrand ? `${selectedBrand.name} email` : "Email"}
        </h1>
      )}
      <EmailDraftsCard
        title={editionTitle ?? (seriesId ? "Editions" : undefined)}
        intro={editionIntro}
        titleAccessory={editionSwitcher}
        actions={editionActions}
        blastsOnly={basePath.startsWith("/app/performance/clients/")}
        brandId={selectedBrand?.id}
        brandName={selectedBrand?.name}
        emails={ownedEmails
          // A client's Broadcasts are standalone emails; a series' editions
          // live on its Newsletters tab.
          .filter((email) =>
            seriesId
              ? email.contentPost?.seriesId === seriesId
              : !basePath.startsWith("/app/performance/clients/") ||
                !email.contentPost?.seriesId,
          )
          .map((email) => {
            const document = documentByEmail.get(email.id);
            const template = NEWSLETTER_TEMPLATES.find(
              (item) =>
                document?.recipeId === item.id ||
                document?.digest?.rationale === `${item.label} template`,
            );
            const image =
              document?.bodyMarkdown.match(
                /<img\b[^>]*\bsrc=["']([^"']+)["']/i,
              )?.[1] ??
              document?.bodyMarkdown.match(
                /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/,
              )?.[1] ??
              document?.digest?.sections
                .flatMap((section) => section.properties)
                .find((home) => home.imageUrl)?.imageUrl;
            return {
              id: email.id,
              title: email.contentPost?.title || email.text || "Untitled email",
              subject: document?.subject || null,
              preheader: document?.preheader || null,
              thumbnail: image && /^https?:\/\//i.test(image) ? image : null,
              template:
                template?.label ??
                (document?.templateKey === "listings-digest"
                  ? "Property digest"
                  : document?.templateKey ===
                      "os.marketing.operator.product-update"
                    ? "Product update"
                    : document
                      ? "Custom email"
                      : "No template yet"),
              homeCount:
                document?.digest?.sections.reduce(
                  (total, section) => total + section.properties.length,
                  0,
                ) ?? 0,
              ctaLabel: document?.ctaLabel || null,
              sequences: sequencesByEmail.get(email.id) ?? [],
              status: email.status,
              updatedAt: email.updatedAt.toISOString(),
              publishedAt: email.publishedAt?.toISOString() ?? null,
              bucket:
                email.status === "slot"
                  ? "Slots"
                  : email.scheduledAt
                    ? "Planned"
                    : "Drafts",
              scheduledAt: email.scheduledAt?.toISOString() ?? null,
            };
          })}
        extraActions={
          <>
            {!selectedBrand && (
              <BrandPagePicker
                brands={brands.flatMap((row) =>
                  row.slug ? [{ slug: row.slug, name: row.name }] : [],
                )}
              />
            )}
            {!settingsCard &&
              !basePath.startsWith("/app/performance/") &&
              selectedBrand && (
                <BrandEmailStyle
                  brandId={selectedBrand.id}
                  brandName={selectedBrand.name}
                  theme={emailIdentity?.emailSender?.theme}
                  copyGuide={emailIdentity?.emailSender?.copyGuide}
                />
              )}
          </>
        }
      />
      {audiencesCard}
      {!seriesId && tagged.length > 0 && (
        <WorkspaceCard
          title="Captured sent emails"
          icon={MailCheck}
          count={tagged.length}
        >
          {tagged.length > 0 && (
            <div className="flex flex-wrap gap-6 text-sm">
              <span>{fmt(totalReach)} reached</span>
              <span>
                {avgOpen != null ? `${Math.round(avgOpen * 100)}%` : "—"}{" "}
                average open rate
              </span>
            </div>
          )}
          {tagged.length > 0 && (
            <>
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
                  <div className="text-muted-foreground">
                    {tagged.length} issues
                  </div>
                </Link>
                {kindCards.map(([kind, a]) => {
                  const meta = NEWSLETTER_KIND_META[kind];
                  const active = kindFilter === kind;
                  return (
                    <Link
                      key={kind}
                      href={newsletterHref({ kind })}
                      className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
                        active
                          ? "border-foreground bg-accent/40"
                          : "hover:bg-accent/40"
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
                        {a.openN
                          ? `${Math.round((a.openSum / a.openN) * 100)}%`
                          : "—"}{" "}
                        open
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* view toggle */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                {(["list", "wall", "read"] as const).map((v) => (
                  <Link
                    key={v}
                    href={newsletterHref({ view: v, kind: kindFilter })}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                      view === v
                        ? "border-border bg-muted text-foreground"
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
            </>
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
                        <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums @xl:block">
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
            <EmptyState
              compact
              icon={MailCheck}
              title={
                tagged.length
                  ? "No sent emails match this filter"
                  : "No sent emails yet"
              }
            />
          )}
        </WorkspaceCard>
      )}
      {settingsCard}

      {showCapture && <NewsletterCapture brands={brands} brand={brand} />}
    </div>
  );
}
