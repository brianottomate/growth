"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs";
import { ExternalLink } from "lucide-react";

import {
  HUBSPOT_PREGEN_LISTS,
  hubspotListUrl,
  type HubspotPregenCohort,
} from "@/lib/hubspot-pregen-lists";
import { useTRPC } from "@/trpc/react";
import { EnrichDrawer, HsMarker, type LeadRow } from "./EnrichDrawer";

const SOURCE_BADGE: Record<string, string> = {
  builtwith: "bg-slate-500/15 text-slate-300",
  hubspot: "bg-orange-500/15 text-orange-300",
  instantly: "bg-violet-500/15 text-violet-300",
};

const VERDICT_TONE: Record<string, string> = {
  send: "bg-emerald-500/15 text-emerald-300",
  review: "bg-amber-500/15 text-amber-300",
  form: "bg-sky-500/15 text-sky-300",
  skip: "bg-slate-500/15 text-slate-400",
};

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;

/**
 * Who am I looking at — exactly one answer at a time.
 *
 * These used to be four independent toggles (inAnyCohort, pregenCohort, netNew,
 * sendBatch) that could be combined into contradictions. "Target list only" plus
 * "Net-new target" returned zero rows every time, because target list requires
 * HubSpot list membership and net-new requires never having been in HubSpot —
 * and target list was on by default, so the net-new pill looked broken. Making
 * this single-select removes the failure mode rather than documenting it.
 *
 * Facets (search, BDR, PMS, enrollable, has-preview, integrated) still compose,
 * because they narrow *within* a population instead of redefining it.
 */
const POPULATIONS = {
  target: {
    label: "Target list",
    hint: "Members of either pre-gen cohort — the active motion",
    input: { inAnyCohort: true },
  },
  recycled: {
    label: "Recycled",
    hint: "Prior Wander outreach to acknowledge",
    input: { pregenCohort: "recycled" as const },
  },
  untouched: {
    label: "Untouched",
    hint: "In the pre-gen cohort, no prior outreach",
    input: { pregenCohort: "untouched" as const },
  },
  netnew: {
    label: "Net-new",
    hint: "Never in the CRM, ranked, has a credible contact",
    input: { netNew: true },
  },
  send20: {
    label: "Send-20",
    hint: "Stamped into a pre-gen send batch",
    input: { sendBatch: true },
  },
  all: {
    label: "Whole universe",
    hint: "Every deduped domain, cohort or not",
    input: {},
  },
} as const;

const POPULATION_KEYS = [
  "target",
  "recycled",
  "untouched",
  "netnew",
  "send20",
  "all",
] as const;

type SourceKey = "builtwith" | "hubspot" | "instantly";

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-foreground text-background border-foreground"
          : "border-border text-muted-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

export function LeadsClient() {
  const trpc = useTRPC();

  // Every filter lives in the URL, so a view is a link. Previously all eleven
  // were useState and nothing about a filtered list was shareable.
  const [population, setPopulation] = useQueryState(
    "pop",
    parseAsStringLiteral(POPULATION_KEYS).withDefault("target"),
  );
  const [view, setView] = useQueryState(
    "view",
    parseAsStringLiteral(["compact", "review"] as const).withDefault("compact"),
  );
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [source, setSource] = useQueryState(
    "source",
    parseAsStringLiteral(["builtwith", "hubspot", "instantly"] as const),
  );
  const [pms, setPms] = useQueryState("pms", parseAsString);
  const [integratedOnly, setIntegratedOnly] = useQueryState(
    "integrated",
    parseAsBoolean.withDefault(false),
  );
  const [hasPregen, setHasPregen] = useQueryState(
    "preview",
    parseAsBoolean.withDefault(false),
  );
  const [enrollableOnly, setEnrollableOnly] = useQueryState(
    "enrollable",
    parseAsBoolean.withDefault(false),
  );
  const [owner, setOwner] = useQueryState("bdr", parseAsString);
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringLiteral([
      "units",
      "composite",
      "domain",
      "updated",
    ] as const).withDefault("units"),
  );
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(0));
  const [showCohortDetail, setShowCohortDetail] = useState(false);
  const [enrichLead, setEnrichLead] = useState<LeadRow | null>(null);
  // Deep-link: ?lead=<domain> opens that lead's drawer (shareable / bookmarkable).
  const [leadParam, setLeadParam] = useQueryState("lead");

  const limit = 50;

  const stats = useQuery(trpc.leads.stats.queryOptions());
  const pmsOptions = useQuery(trpc.leads.pmsOptions.queryOptions());
  // Scoped to the pregen cohorts so the list reads as "reps with target
  // companies", not "reps who happen to own enrichment records".
  const ownerOptions = useQuery(
    trpc.leads.ownerOptions.queryOptions({ pregenOnly: true }),
  );

  const list = useQuery(
    trpc.leads.listDomains.queryOptions(
      {
        // Exactly one population, then facets on top of it.
        ...POPULATIONS[population].input,
        q: q || undefined,
        source: source ?? undefined,
        pms: pms ?? undefined,
        integratedPmsOnly: integratedOnly || undefined,
        hasPregenSite: hasPregen || undefined,
        enrollableOnly: enrollableOnly || undefined,
        owner: owner ?? undefined,
        // The review card needs the scored channel and latest draft; the compact
        // row does not, so it does not pay for them.
        withReview: view === "review" || undefined,
        sort,
        dir: sort === "domain" ? "asc" : "desc",
        limit,
        offset: page * limit,
      },
      { placeholderData: keepPreviousData },
    ),
  );

  // Resolve a deep-linked lead (?lead=domain) that isn't already open — search
  // for it so the drawer opens even when the lead is outside the current filter.
  const deepLink = useQuery(
    trpc.leads.listDomains.queryOptions(
      { q: leadParam ?? "", limit: 5 },
      { enabled: !!leadParam && enrichLead?.domain !== leadParam },
    ),
  );
  useEffect(() => {
    if (!leadParam || enrichLead?.domain === leadParam) return;
    const item = [
      ...(list.data?.items ?? []),
      ...(deepLink.data?.items ?? []),
    ].find((i) => i.domain === leadParam);
    if (item) setEnrichLead(item);
  }, [leadParam, enrichLead, list.data, deepLink.data]);

  const resetPage = () => void setPage(0);
  const s = stats.data;
  const membershipCount = (
    cohort: HubspotPregenCohort,
    objectType: "company" | "contact",
  ) =>
    s?.targetMemberships.find(
      (row) => row.cohort === cohort && row.objectType === objectType,
    );
  const enrollableCount = (cohort: HubspotPregenCohort) =>
    s?.targetEnrollable.find((row) => row.cohort === cohort);

  // Counts on the population pills, so the two big cohort cards that used to
  // carry them are no longer needed above the list.
  const populationCount = (key: (typeof POPULATION_KEYS)[number]) => {
    if (!s) return null;
    if (key === "netnew") return fmt(s.netNew);
    if (key === "send20") return fmt(s.sendBatch);
    if (key === "all") return fmt(s.domains);
    if (key === "recycled" || key === "untouched")
      return fmt(enrollableCount(key)?.enrollable);
    // Target list is both cohorts, which is what the enrollable numbers add to.
    return fmt(
      s.targetEnrollable.reduce((sum, row) => sum + row.enrollable, 0),
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Domain-centric prospecting universe · BuiltWith + HubSpot + Instantly,
        deduped on domain
      </p>

      {/* One quiet line for the universe. These are reference numbers looked at
          occasionally, and as six tiles they cost more attention than they earn —
          two of them also duplicated filter pills, so it read as if a tile were a
          control. Details on demand. */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
        <span className="text-muted-foreground">
          {fmt(s?.domains)} domains · {fmt(s?.contacts)} contacts ·{" "}
          {fmt(s?.withPregenSite)} previews · {fmt(s?.ranked)} ranked ·{" "}
          {fmt(s?.integratedPms)} integrated PMS · {fmt(s?.untouched)} not in CRM
        </span>
        <button
          onClick={() => setShowCohortDetail(!showCohortDetail)}
          className="text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {showCohortDetail ? "hide cohort detail" : "cohort detail"}
        </button>
      </div>

      {showCohortDetail && (
        <div className="border-border mt-2 grid gap-2 rounded-lg border p-3 text-xs lg:grid-cols-2">
          {(
            Object.entries(HUBSPOT_PREGEN_LISTS) as Array<
              [
                HubspotPregenCohort,
                (typeof HUBSPOT_PREGEN_LISTS)[HubspotPregenCohort],
              ]
            >
          ).map(([cohort, config]) => {
            const reach = enrollableCount(cohort);
            const companies = membershipCount(cohort, "company");
            const contacts = membershipCount(cohort, "contact");
            return (
              <div key={cohort} className="flex flex-wrap items-center gap-x-3">
                <span className="font-medium">{config.label}</span>
                <span className="text-muted-foreground">
                  {fmt(reach?.enrollable)} enrollable of {fmt(reach?.linked)}{" "}
                  linked
                  {reach && reach.linked > reach.enrollable
                    ? ` · ${fmt(reach.linked - reach.enrollable)} not reachable`
                    : ""}
                  {" · "}
                  {fmt(companies?.count)} companies · {fmt(contacts?.count)}{" "}
                  contacts
                </span>
                <a
                  href={hubspotListUrl(config.company.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground inline-flex items-center gap-1 hover:underline"
                >
                  HubSpot <ExternalLink className="size-3" />
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Population — one answer to "who am I looking at", then density. */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground mr-1 text-xs">Population</span>
        {POPULATION_KEYS.map((key) => (
          <Pill
            key={key}
            active={population === key}
            onClick={() => {
              void setPopulation(key);
              resetPage();
            }}
          >
            {POPULATIONS[key].label}
            {populationCount(key) != null ? ` · ${populationCount(key)}` : ""}
          </Pill>
        ))}
        <span className="flex-1" />
        <span className="text-muted-foreground mr-1 text-xs">View</span>
        <Pill active={view === "compact"} onClick={() => void setView("compact")}>
          Compact
        </Pill>
        <Pill active={view === "review"} onClick={() => void setView("review")}>
          Review cards
        </Pill>
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs">
        {POPULATIONS[population].hint}
      </p>

      {/* Facets — these narrow within the population, so they compose freely. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-b pb-4">
        <input
          value={q}
          onChange={(e) => {
            void setQ(e.target.value);
            resetPage();
          }}
          placeholder="Search domain or company…"
          className="border-border bg-background focus:ring-ring w-64 rounded-md border px-3 py-1.5 text-sm focus:ring-1 focus:outline-none"
        />
        <select
          value={source ?? ""}
          onChange={(event) => {
            void setSource(
              (event.target.value || null) as typeof source,
            );
            resetPage();
          }}
          className="border-border bg-background rounded-md border px-2 py-1.5 text-xs"
        >
          <option value="">All sources</option>
          {(["builtwith", "hubspot", "instantly"] as SourceKey[]).map((sk) => (
            <option key={sk} value={sk}>
              {sk} {s ? `(${fmt(s[sk])})` : ""}
            </option>
          ))}
        </select>
        <select
          value={owner ?? ""}
          onChange={(event) => {
            void setOwner(event.target.value || null);
            resetPage();
          }}
          className="border-border bg-background rounded-md border px-2 py-1.5 text-xs"
        >
          <option value="">All BDRs</option>
          {ownerOptions.data?.map((o) => (
            <option key={o.owner} value={o.owner ?? ""}>
              {o.owner} ({o.count})
            </option>
          ))}
        </select>
        <select
          value={pms ?? ""}
          onChange={(e) => {
            void setPms(e.target.value || null);
            resetPage();
          }}
          className="border-border bg-background rounded-md border px-2 py-1.5 text-xs"
        >
          <option value="">All PMS</option>
          {pmsOptions.data?.map((p) => (
            <option key={p.pms} value={p.pms ?? ""}>
              {p.pms} ({p.count})
            </option>
          ))}
        </select>
        <Pill
          active={integratedOnly}
          onClick={() => {
            void setIntegratedOnly(!integratedOnly);
            resetPage();
          }}
        >
          Integrated PMS
        </Pill>
        <Pill
          active={hasPregen}
          onClick={() => {
            void setHasPregen(!hasPregen);
            resetPage();
          }}
        >
          Has preview URL
        </Pill>
        <Pill
          active={enrollableOnly}
          onClick={() => {
            void setEnrollableOnly(!enrollableOnly);
            resetPage();
          }}
        >
          Enrollable only
        </Pill>
        <span className="flex-1" />
        <select
          value={sort}
          onChange={(e) => {
            void setSort(e.target.value as typeof sort);
            resetPage();
          }}
          className="border-border bg-background rounded-md border px-2 py-1.5 text-xs"
        >
          <option value="units">Sort: units</option>
          <option value="composite">Sort: score</option>
          <option value="domain">Sort: domain A–Z</option>
          <option value="updated">Sort: recently updated</option>
        </select>
      </div>

      {/* result count */}
      <div className="text-muted-foreground mt-3 text-xs">
        {list.data
          ? `${fmt(list.data.total)} matching domains · click a row to inspect & enrich`
          : "Loading…"}
      </div>

      {/* Review cards — the send-review surface as a density level over the same
          filtered set, so the two cannot show different facts about one company
          the way the screenshot-on-one-list-only bug did. */}
      {view === "review" ? (
        <div className="mt-2 space-y-3">
          {list.data?.items.map((d) => (
            <ReviewCard key={d.id} item={d} />
          ))}
          {list.data?.items.length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nothing in this population matches those facets.
            </p>
          )}
        </div>
      ) : (
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="border-b py-2 pr-3 font-medium">Domain</th>
              <th className="border-b px-3 py-2 font-medium">Company</th>
              <th className="border-b px-3 py-2 font-medium">PMS</th>
              <th className="border-b px-3 py-2 text-right font-medium">
                Units
              </th>
              <th className="border-b px-3 py-2 text-right font-medium">
                Contacts
              </th>
              <th className="border-b px-3 py-2 font-medium">Tier</th>
              <th className="border-b px-3 py-2 font-medium">CRM</th>
              <th className="border-b px-3 py-2 font-medium">Pre-Gen cohort</th>
              <th className="border-b px-3 py-2 font-medium">Sources</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((d) => (
              <tr
                key={d.id}
                onClick={() => {
                  setEnrichLead(d);
                  void setLeadParam(d.domain);
                }}
                className="hover:bg-accent/30 cursor-pointer"
              >
                <td className="border-b py-2 pr-3 font-medium">
                  <div className="flex items-center gap-2">
                    {/* The prospect's current site, captured by the ranker.
                        Only ranked domains have one. */}
                    {d.siteScreenshotUrl && (
                      <div className="border-border bg-muted relative h-8 w-12 shrink-0 overflow-hidden rounded border">
                        <Image
                          src={d.siteScreenshotUrl}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover object-top"
                          unoptimized
                        />
                      </div>
                    )}
                    <a
                      href={`https://${d.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {d.domain}
                      <ExternalLink className="size-3 opacity-40" />
                    </a>
                    {/* Full prospect view — linkable, and what page-context
                        resolves as "this prospect" in chat. The row click still
                        opens the drawer. */}
                    <Link
                      href={`/app/leads/${encodeURIComponent(d.domain)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                    >
                      open
                    </Link>
                  </div>
                </td>
                <td className="text-muted-foreground border-b px-3 py-2">
                  <span className="line-clamp-1 max-w-[16rem]">
                    {d.companyName ?? "—"}
                  </span>
                </td>
                <td className="border-b px-3 py-2">
                  {d.pms ? (
                    <span className="inline-flex items-center gap-1">
                      {d.pms}
                      {d.isIntegratedPms && (
                        <span
                          className="size-1.5 rounded-full bg-emerald-400"
                          title="Integrated PMS"
                        />
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="border-b px-3 py-2 text-right tabular-nums">
                  {fmt(d.unitCount)}
                </td>
                <td className="border-b px-3 py-2 text-right tabular-nums">
                  <span
                    className={
                      d.contactCount > 0 ? "" : "text-muted-foreground"
                    }
                  >
                    {d.contactCount}
                  </span>
                </td>
                <td className="text-muted-foreground border-b px-3 py-2 text-xs">
                  {d.sourceTier ?? "—"}
                </td>
                <td className="border-b px-3 py-2">
                  <HsMarker
                    inHubspot={d.inHubspot}
                    leadStatus={d.hubspotLeadStatus}
                  />
                </td>
                <td className="border-b px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {d.pregenCohorts.map((cohort) => (
                      <span
                        key={cohort}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          cohort === "recycled"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-sky-500/15 text-sky-300"
                        }`}
                      >
                        {cohort}
                      </span>
                    ))}
                    {d.pregenCohorts.length === 0 && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
                <td className="border-b px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(["builtwith", "hubspot", "instantly"] as SourceKey[])
                      .filter((sk) =>
                        sk === "builtwith"
                          ? d.inBuiltwith
                          : sk === "hubspot"
                            ? d.inHubspot
                            : d.inInstantly,
                      )
                      .map((sk) => (
                        <span
                          key={sk}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_BADGE[sk]}`}
                        >
                          {sk.slice(0, 2).toUpperCase()}
                        </span>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {list.data && list.data.items.length === 0 && (
          <div className="text-muted-foreground py-12 text-center text-sm">
            No domains match these filters.
          </div>
        )}
      </div>
      )}

      {/* pagination */}
      {list.data && list.data.total > limit && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">
            {page * limit + 1}–{Math.min((page + 1) * limit, list.data.total)}{" "}
            of {fmt(list.data.total)}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => void setPage((p) => Math.max(0, p - 1))}
              className="border-border rounded-md border px-3 py-1 text-xs disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={!list.data.hasMore}
              onClick={() => void setPage((p) => p + 1)}
              className="border-border rounded-md border px-3 py-1 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <EnrichDrawer
        lead={enrichLead}
        open={enrichLead !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEnrichLead(null);
            void setLeadParam(null);
          }
        }}
      />
    </div>
  );
}

/**
 * The send-review card, rendered from the shared list query.
 *
 * Previously /leads and /leads/send-review ran different queries over the same
 * table, which is how the site screenshot ended up on send-review rows only and
 * invisible where it was looked for. Both densities now read one filtered set.
 */
function ReviewCard({
  item,
}: {
  item: {
    id: string;
    domain: string;
    companyName: string | null;
    pms: string | null;
    unitCount: number | null;
    scorePregenPotential: number | null;
    pregenSiteUrl: string | null;
    pregenCohorts: string[];
    siteScreenshotUrl: string | null;
    review: {
      channel: {
        bestEmail: string | null;
        route: string;
        verdict: string;
        score: number;
        candidates: Array<{
          email: string;
          name: string | null;
          title: string | null;
          score: number;
          verdict: string;
          risks: string[];
        }>;
      };
      outreach: { status: string; angle: string | null } | null;
    } | null;
  };
}) {
  const review = item.review;
  const verdict = review?.channel.verdict ?? "skip";
  return (
    <div
      className={`bg-card rounded-xl border p-4 ${
        verdict === "send"
          ? "border-emerald-500/30"
          : verdict === "review"
            ? "border-amber-500/30"
            : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${VERDICT_TONE[verdict]}`}
        >
          {verdict}
          {review ? ` · ${review.channel.score}` : ""}
        </span>
        <Link
          href={`/app/leads/${encodeURIComponent(item.domain)}`}
          className="font-medium hover:underline"
        >
          {item.domain}
        </Link>
        <span className="text-muted-foreground text-xs">
          {[item.companyName, item.pms].filter(Boolean).join(" · ")}
        </span>
        <span className="flex-1" />
        <span className="text-muted-foreground text-xs">
          fit {item.scorePregenPotential ?? "—"} · units {item.unitCount ?? "—"}
        </span>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-muted-foreground text-xs">Selected channel</p>
          <p className="font-mono text-xs break-all">
            {review?.channel.bestEmail ?? "no reachable contact"}
          </p>
          {review?.channel.candidates.length ? (
            <ul className="mt-2 space-y-0.5">
              {review.channel.candidates.slice(0, 5).map((candidate) => (
                <li
                  key={candidate.email}
                  className="text-muted-foreground text-[11px]"
                >
                  <span className="tabular-nums">{candidate.score}</span>{" "}
                  {candidate.email}
                  {candidate.risks.length ? ` — ${candidate.risks[0]}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Sequence</p>
          {review?.outreach ? (
            <>
              <p className="text-xs">{review.outreach.status}</p>
              <p className="text-muted-foreground mt-1 line-clamp-3 text-[11px]">
                {review.outreach.angle ?? "no angle recorded"}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-xs">No draft yet</p>
          )}
          {!item.pregenSiteUrl && (
            <p className="mt-1 text-[11px] text-amber-300">
              No preview assigned — nothing can be generated yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
