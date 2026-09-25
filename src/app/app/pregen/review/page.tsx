import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import {
  leadContactTable,
  leadDomainTable,
  leadSequenceTable,
  pregenBuildTable,
} from "@/server/db/leads-schema";
import { pickBestPregenContact } from "@/server/services/pregen-send.service";

import { VerdictButtons } from "./VerdictButtons";

/**
 * A batch of previews stacked as live iframes, so a send wave can be reviewed
 * by scrolling one page instead of opening ten tabs.
 *
 * The iframes load the renderer preview URL directly, not the wander.com/os
 * wrapper — the view beacon lives on the wrapper, so reviewing here cannot ping
 * sales or trip the on-open BDR rotation.
 *
 * Each preview carries its verdict, so reviewing and recording are the same
 * pass. A separate judge route was tried and dropped: its selling point was
 * the prospect's own site beside ours, and most prospect sites refuse framing
 * (`X-Frame-Options`) with no way to detect the refusal from the page, so the
 * comparison silently became an empty box. This page already holds the context
 * the decision needs — recipient, greeting defect, PMS, units, tier.
 *
 * `?domains=a.com,b.com` reviews an explicit list; the default is the next
 * send wave: unsent, UNJUDGED READY builds, scheduled ones first, newest build
 * last. Excluding judged builds is what makes the default a queue that drains
 * instead of a list that reopens on the same ten sites.
 */

export const dynamic = "force-dynamic";

const REVIEW_CAP = 10;

/**
 * Who this send goes to and what we know about them, above the preview.
 *
 * Reviewing a site in isolation answers "is this good", not "is this good for
 * them" — and the greeting warning below is the one defect that is invisible in
 * the preview yet blocks the send.
 */
function RecipientStrip({
  row,
  pick,
}: {
  row: {
    companyName: string | null;
    city: string | null;
    state: string | null;
    pms: string | null;
    unitCount: number | null;
    unitEstimate: number | null;
    computedTier: string | null;
  };
  pick: ReturnType<typeof pickBestPregenContact> | undefined;
}) {
  const contact = pick?.contact;
  const name = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    : "";
  const firstName = contact?.firstName?.trim() ?? "";
  // The refusal the batch send raises: HubSpot renders the first-name token, so
  // a company name parked there greets the prospect as "Hi OmniVillas,".
  const greetingBroken =
    !!firstName &&
    firstName.toLowerCase() === row.companyName?.trim().toLowerCase();
  const units = row.unitCount ?? row.unitEstimate;
  const facts = [
    [row.city, row.state].filter(Boolean).join(", ") || null,
    row.pms,
    units ? `${units} units` : null,
    row.computedTier ? `tier ${row.computedTier}` : null,
  ].filter(Boolean);

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {contact ? (
        <span className="text-foreground">
          {name || "(no name)"}
          {contact.jobTitle ? (
            <span className="text-muted-foreground"> · {contact.jobTitle}</span>
          ) : null}
          <span className="text-muted-foreground"> · {contact.email}</span>
        </span>
      ) : (
        <span className="text-amber-400">
          No enrollable contact — this one cannot send
        </span>
      )}
      {pick && pick.enrollable > 1 ? (
        <span>best of {pick.enrollable}</span>
      ) : null}
      {facts.length ? <span>{facts.join(" · ")}</span> : null}
      {greetingBroken ? (
        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
          greeting would read &ldquo;Hi {firstName},&rdquo; — clear the first
          name in HubSpot
        </span>
      ) : null}
    </div>
  );
}

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
      buildId: pregenBuildTable.id,
      domainId: leadDomainTable.id,
      domain: pregenBuildTable.domain,
      verdict: pregenBuildTable.verdict,
      businessName: pregenBuildTable.businessName,
      previewUrl: pregenBuildTable.previewUrl,
      sendScheduledFor: pregenBuildTable.sendScheduledFor,
      companyName: leadDomainTable.companyName,
      city: leadDomainTable.city,
      state: leadDomainTable.state,
      pms: leadDomainTable.pms,
      unitCount: leadDomainTable.unitCount,
      unitEstimate: leadDomainTable.unitEstimate,
      computedTier: leadDomainTable.computedTier,
      enrichment: leadDomainTable.enrichment,
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
            isNull(pregenBuildTable.verdict),
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

  // Who the email would actually go to, resolved through the send path's own
  // picker so this page cannot show one person while the send picks another.
  const contacts = previews.length
    ? await db
        .select()
        .from(leadContactTable)
        .where(
          and(
            inArray(
              leadContactTable.domainId,
              previews.map((row) => row.domainId),
            ),
            isNull(leadContactTable.deletedAt),
          ),
        )
    : [];
  const byDomainId = new Map<string, (typeof contacts)[number][]>();
  for (const contact of contacts) {
    const list = byDomainId.get(contact.domainId) ?? [];
    list.push(contact);
    byDomainId.set(contact.domainId, list);
  }

  const recipients = new Map(
    previews.map((row) => [
      row.domain,
      pickBestPregenContact(row, byDomainId.get(row.domainId) ?? []),
    ]),
  );

  return (
    // Wider than the rest of /app: these iframes are the artefact being judged,
    // and the app layout's centered max-w-5xl column renders a desktop site at
    // ~900px, which is narrow enough to change how the design reads. The cqw
    // negative margin escapes that column (the layout's scroll div is the
    // @container) exactly as the content Board does, then the inner cap keeps
    // an ultrawide monitor from stretching a preview past readable.
    <div className="mx-[calc(((100cqw-min(100cqw,64rem))/2+1rem)*-1)] @xl:mx-[calc(((100cqw-min(100cqw,64rem))/2+2rem)*-1)]">
      <div className="mx-auto w-full max-w-[100rem] p-4 @xl:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Pregen review</h1>
            <p className="text-sm text-muted-foreground">
              {previews.length} preview{previews.length === 1 ? "" : "s"}
              {requested?.length
                ? " (explicit list)"
                : " — next send wave, unjudged"}{" "}
              · no view beacons fire from this page
            </p>
          </div>
          <Link
            href="/app/pregen"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            All builds
          </Link>
        </div>

        {previews.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to review. Every READY build is sent, judged or excluded.
          </p>
        ) : (
          <div className="space-y-10">
            {previews.map((row, index) => (
              <section key={row.domain}>
                <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-background/95 py-2 backdrop-blur">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {index + 1}/{previews.length}
                  </span>
                  <h2 className="font-medium">
                    {row.businessName ?? row.companyName ?? row.domain}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {row.domain}
                  </span>
                  {row.sendScheduledFor ? (
                    <span className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">
                      sends {row.sendScheduledFor}
                    </span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-3 text-xs">
                    <VerdictButtons
                      buildId={row.buildId}
                      initial={row.verdict ?? null}
                    />
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
                <RecipientStrip row={row} pick={recipients.get(row.domain)} />
                <iframe
                  src={row.previewUrl!}
                  title={`Preview for ${row.domain}`}
                  loading="lazy"
                  className="h-[80vh] w-full rounded border border-border bg-white"
                />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
