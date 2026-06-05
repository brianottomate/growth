import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { memberTable, platformPostTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { fetchNewsletterContent } from "@/server/clients/cio-content";
import { NEWSLETTER_KIND_META, newsletterKind } from "@/lib/newsletter-kind";

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;

export default async function NewsletterIssuePage({
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

  const issue = await db.query.platformPostTable.findFirst({
    where: and(
      eq(platformPostTable.id, id),
      eq(platformPostTable.externalKind, "broadcast"),
    ),
    with: { brand: true },
  });
  if (!issue || issue.brand?.organizationId !== org.id) notFound();

  const kind = newsletterKind(issue.text ?? "");
  const meta = NEWSLETTER_KIND_META[kind];
  const s = issue.stats;
  const content = issue.externalId
    ? await fetchNewsletterContent(issue.externalId)
    : null;

  const metrics = [
    { label: "Sent", value: s?.sent },
    { label: "Delivered", value: s?.delivered },
    { label: "Opened", value: s?.opened },
    { label: "Clicked", value: s?.clicks },
    { label: "Unsub", value: s?.unsubscribed },
  ].filter((m) => m.value != null && m.value > 0);

  return (
    <div>
      {/* breadcrumb */}
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Link href="/app/newsletters" className="hover:text-foreground">
          Newsletters
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{issue.text}</span>
      </div>

      {/* header */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {content?.subject ?? issue.text}
        </h1>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ background: `${meta.color}22`, color: meta.color }}
        >
          {meta.label}
        </span>
      </div>
      <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-sm">
        {issue.publishedAt && (
          <span>
            {issue.publishedAt.toLocaleDateString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
        <span>· The Dispatch</span>
        {issue.externalUrl && (
          <>
            <span>·</span>
            <a
              href={issue.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline"
            >
              Open in Customer.io ↗
            </a>
          </>
        )}
      </div>

      {/* metrics */}
      {metrics.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-6 border-y py-4">
          {metrics.map((m) => (
            <div key={m.label}>
              <div className="text-lg font-semibold tabular-nums">{fmt(m.value!)}</div>
              <div className="text-muted-foreground text-[10px] uppercase tracking-wide">
                {m.label}
              </div>
            </div>
          ))}
          {s?.delivered && s?.opened != null && (
            <div>
              <div className="text-lg font-semibold tabular-nums">
                {Math.round((s.opened / s.delivered) * 100)}%
              </div>
              <div className="text-muted-foreground text-[10px] uppercase tracking-wide">
                Open rate
              </div>
            </div>
          )}
        </div>
      )}

      {/* basic body preview */}
      <h2 className="text-muted-foreground mt-6 mb-2 text-xs font-semibold uppercase tracking-wider">
        Preview
      </h2>
      {content?.body ? (
        <iframe
          srcDoc={content.body}
          sandbox=""
          title="Newsletter preview"
          className="h-[75vh] w-full rounded-xl border bg-white"
        />
      ) : (
        <div className="text-muted-foreground rounded-xl border p-6 text-sm">
          Couldn&apos;t load the rendered body from Customer.io.{" "}
          {issue.externalUrl && (
            <a
              href={issue.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline"
            >
              Open it in Customer.io ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
