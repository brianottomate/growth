import { desc } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { osInspectUrl } from "@/lib/pregen-urls";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import {
  leadContactTable,
  leadDomainTable,
  leadSequenceTable,
  pregenBuildTable,
} from "@/server/db/leads-schema";
import { eq } from "drizzle-orm";

/**
 * Every pre-generated site, newest first.
 *
 * Deliberately not a filtered view of /app/leads: that page answers "who should
 * we write to", one company at a time behind a population filter. This answers
 * "what have we built", which is the question asked when someone wants to look
 * at the work — and the batch now spans more sites than a review card list can
 * be scrolled through.
 */

export const dynamic = "force-dynamic";

const VERDICT_STYLES: Record<string, string> = {
  send_worthy: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  regenerate: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  skip: "border-border text-muted-foreground",
};

const VERDICT_LABELS: Record<string, string> = {
  send_worthy: "send-worthy",
  regenerate: "regenerate",
  skip: "skip",
};

const STATUS_STYLES: Record<string, string> = {
  READY: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  GENERATING: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  FAILED: "border-red-500/40 bg-red-500/10 text-red-300",
  CLAIMED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

function elapsed(from: Date, to: Date | null): string {
  const minutes = Math.round(
    ((to ?? new Date()).getTime() - from.getTime()) / 60000,
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24
    ? `${hours}h ${minutes % 60}m`
    : `${Math.floor(hours / 24)}d`;
}

export default async function PregenPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const builds = await db
    .select({
      id: pregenBuildTable.id,
      domainId: pregenBuildTable.domainId,
      domain: pregenBuildTable.domain,
      businessName: pregenBuildTable.businessName,
      status: pregenBuildTable.status,
      previewUrl: pregenBuildTable.previewUrl,
      requestedAt: pregenBuildTable.requestedAt,
      settledAt: pregenBuildTable.settledAt,
      claimedAt: pregenBuildTable.claimedAt,
      viewCount: pregenBuildTable.viewCount,
      verdict: pregenBuildTable.verdict,
      errorMessage: pregenBuildTable.errorMessage,
      batch: leadDomainTable.pregenBatch,
      companyName: leadDomainTable.companyName,
      units: leadDomainTable.unitCount,
      pms: leadDomainTable.pms,
      owner: leadDomainTable.hubspotOwner,
      tier: leadDomainTable.computedTier,
      hasDeal: leadDomainTable.hasHubspotDeal,
      excluded: leadDomainTable.excludeFromOutreach,
      excludeReason: leadDomainTable.excludeReason,
    })
    .from(pregenBuildTable)
    .leftJoin(
      leadDomainTable,
      eq(leadDomainTable.id, pregenBuildTable.domainId),
    )
    .orderBy(desc(pregenBuildTable.requestedAt));

  // Fetched separately rather than joined: a company can carry more than one
  // sequence row (a retired recipient leaves its own), and joining would
  // duplicate build rows instead of annotating them.
  const sent = await db
    .select({
      domainId: leadSequenceTable.domainId,
      enrolledAt: leadSequenceTable.enrolledAt,
      email: leadContactTable.email,
    })
    .from(leadSequenceTable)
    .leftJoin(
      leadContactTable,
      eq(leadContactTable.id, leadSequenceTable.contactId),
    )
    .where(eq(leadSequenceTable.status, "sent"));
  const sentByDomain = new Map(sent.map((row) => [row.domainId, row]));

  const ready = builds.filter((build) => build.status === "READY").length;
  const viewed = builds.filter((build) => build.viewCount > 0).length;
  // Companies, not builds: a rebuild leaves two rows on one domain, and this
  // number is compared against the sends in HubSpot.
  const unjudged = builds.filter(
    (build) => build.status === "READY" && !build.verdict,
  ).length;
  const enrolled = new Set(
    builds
      .map((build) => build.domainId)
      .filter((id) => id && sentByDomain.has(id)),
  ).size;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold">Pre-gen sites</h1>
            {unjudged > 0 && (
              <Link
                href="/app/pregen/review"
                className="text-sm underline underline-offset-2"
              >
                review {unjudged} →
              </Link>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {builds.length} built · {ready} ready · {viewed} opened by the
            prospect · {enrolled} in sequence · newest first
          </p>
        </div>
        <Link
          href="/app/pregen/review"
          className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Review next wave
        </Link>
      </header>

      <ul className="divide-y divide-border">
        {builds.map((build) => {
          // The beacon-free wrapper: opening from here is us looking, and an
          // operator's click must never read to sales as the prospect browsing.
          const inspect = build.previewUrl
            ? osInspectUrl(build.previewUrl)
            : null;
          const enrolment = build.domainId
            ? sentByDomain.get(build.domainId)
            : undefined;
          return (
            <li
              key={build.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
            >
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  STATUS_STYLES[build.status ?? ""] ??
                  "border-border text-muted-foreground"
                }`}
              >
                {build.status ?? "requested"}
              </span>

              <span className="min-w-0 flex-1 truncate font-medium">
                {build.companyName ?? build.businessName ?? build.domain}
              </span>

              {build.verdict && (
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                    VERDICT_STYLES[build.verdict] ?? "border-border"
                  }`}
                >
                  {VERDICT_LABELS[build.verdict] ?? build.verdict}
                </span>
              )}

              {enrolment ? (
                <span
                  className="shrink-0 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300"
                  title={`${enrolment.email ?? "unknown recipient"}${
                    enrolment.enrolledAt
                      ? ` · enrolled ${enrolment.enrolledAt.toISOString().slice(0, 10)}`
                      : ""
                  }`}
                >
                  in sequence
                </span>
              ) : build.excluded ? (
                <span
                  className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                  title={build.excludeReason ?? undefined}
                >
                  excluded
                </span>
              ) : null}

              <span className="min-w-0 text-xs text-muted-foreground">
                {[
                  build.batch,
                  build.pms,
                  build.units ? `${build.units} homes` : null,
                  build.viewCount > 0 ? `${build.viewCount} views` : null,
                  build.claimedAt ? "CLAIMED" : null,
                  build.tier,
                  build.owner,
                  build.hasDeal ? "deal" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>

              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {build.requestedAt.toISOString().slice(0, 16).replace("T", " ")}{" "}
                · {elapsed(build.requestedAt, build.settledAt)}
              </span>

              <span className="flex shrink-0 items-center gap-2 text-xs">
                {inspect ? (
                  <a
                    href={inspect}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    preview ↗
                  </a>
                ) : (
                  <span className="text-muted-foreground">no preview</span>
                )}
                <a
                  href={`https://${build.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground underline underline-offset-2"
                >
                  their site ↗
                </a>
                <Link
                  href={`/app/leads/${build.domain}`}
                  className="text-muted-foreground underline underline-offset-2"
                >
                  lead
                </Link>
              </span>

              {build.errorMessage && (
                <p className="w-full text-xs text-muted-foreground">
                  {build.errorMessage}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
