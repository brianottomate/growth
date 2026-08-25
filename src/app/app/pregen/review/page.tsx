import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import {
  leadDomainTable,
  leadSequenceTable,
  pregenBuildTable,
} from "@/server/db/leads-schema";

/**
 * A batch of previews stacked as live iframes, so a send wave can be reviewed
 * by scrolling one page instead of opening ten tabs.
 *
 * The iframes load the renderer preview URL directly, not the wander.com/os
 * wrapper — the view beacon lives on the wrapper, so reviewing here cannot ping
 * sales or trip the on-open BDR rotation.
 *
 * `?domains=a.com,b.com` reviews an explicit list; the default is the next
 * send wave: unsent READY builds, scheduled ones first, newest build last.
 */

export const dynamic = "force-dynamic";

const REVIEW_CAP = 10;

export default async function PregenReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ domains?: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const { domains } = await searchParams;
  const requested = domains
    ?.split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, REVIEW_CAP);

  const rows = await db
    .select({
      domain: pregenBuildTable.domain,
      businessName: pregenBuildTable.businessName,
      previewUrl: pregenBuildTable.previewUrl,
      sendScheduledFor: pregenBuildTable.sendScheduledFor,
      companyName: leadDomainTable.companyName,
    })
    .from(pregenBuildTable)
    .innerJoin(
      leadDomainTable,
      eq(leadDomainTable.id, pregenBuildTable.domainId),
    )
    .where(
      requested?.length
        ? inArray(pregenBuildTable.domain, requested)
        : and(
            eq(pregenBuildTable.status, "READY"),
            eq(leadDomainTable.excludeFromOutreach, false),
            isNull(leadDomainTable.deletedAt),
            sql`not exists (select 1 from ${leadSequenceTable} where ${leadSequenceTable.domainId} = ${pregenBuildTable.domainId} and ${leadSequenceTable.hubspotEnrollmentId} is not null)`,
          ),
    )
    .orderBy(
      sql`${pregenBuildTable.sendScheduledFor} asc nulls last`,
      desc(pregenBuildTable.requestedAt),
    )
    .limit(REVIEW_CAP);

  const previews = rows.filter((row) => row.previewUrl);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Pregen review</h1>
          <p className="text-muted-foreground text-sm">
            {previews.length} preview{previews.length === 1 ? "" : "s"}
            {requested?.length ? " (explicit list)" : " — next send wave"} · no
            view beacons fire from this page
          </p>
        </div>
        <Link
          href="/app/pregen"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          All builds
        </Link>
      </div>

      {previews.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing to review. Every READY build is either sent or excluded.
        </p>
      ) : (
        <div className="space-y-10">
          {previews.map((row, index) => (
            <section key={row.domain}>
              <div className="bg-background/95 border-border sticky top-0 z-10 mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2 backdrop-blur">
                <span className="text-muted-foreground text-sm tabular-nums">
                  {index + 1}/{previews.length}
                </span>
                <h2 className="font-medium">
                  {row.businessName ?? row.companyName ?? row.domain}
                </h2>
                <span className="text-muted-foreground text-sm">
                  {row.domain}
                </span>
                {row.sendScheduledFor ? (
                  <span className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">
                    sends {row.sendScheduledFor}
                  </span>
                ) : null}
                <span className="ml-auto flex gap-3 text-xs">
                  <a
                    href={row.previewUrl!}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Open preview
                  </a>
                  <Link
                    href={`/app/leads/${encodeURIComponent(row.domain)}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Lead
                  </Link>
                </span>
              </div>
              <iframe
                src={row.previewUrl!}
                title={`Preview for ${row.domain}`}
                loading="lazy"
                className="border-border h-[80vh] w-full rounded border bg-white"
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
