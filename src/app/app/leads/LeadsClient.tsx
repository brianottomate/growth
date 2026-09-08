"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
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
import { CURRENT_PREGEN_BATCH } from "@/lib/pregen-batch";
import { PREGEN_SEQUENCE_SENDER_EMAIL } from "@/lib/pregen-sequence";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/react";
import { EnrichDrawer, HsMarker, type LeadRow } from "./EnrichDrawer";
import {
  ProspectReviewCard,
  type ProspectCardData,
} from "./ProspectReviewCard";
import { PregenBuildsBanner, type InFlightBuild } from "./PregenBuildsBanner";

const SOURCE_BADGE: Record<string, string> = {
  builtwith: "bg-slate-500/15 text-slate-300",
  hubspot: "bg-orange-500/15 text-orange-300",
  instantly: "bg-violet-500/15 text-violet-300",
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
  newbatch: {
    label: "New",
    hint: "The batch being worked right now — pre-gen sites just requested",
    input: { pregenBatch: CURRENT_PREGEN_BATCH },
  },
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
  previews: {
    label: "Has preview",
    hint: "A pregenerated site exists — the pool sequences get drafted against",
    input: { hasPregenSite: true },
  },
  all: {
    label: "Whole universe",
    hint: "Every deduped domain, cohort or not",
    input: {},
  },
} as const;

const POPULATION_KEYS = [
  "newbatch",
  "target",
  "recycled",
  "untouched",
  "netnew",
  "send20",
  "previews",
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
    parseAsStringLiteral(POPULATION_KEYS).withDefault("newbatch"),
  );
  const [view, setView] = useQueryState(
    "view",
    parseAsStringLiteral(["compact", "review"] as const).withDefault("review"),
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
  // Excluded companies are not prospects, and they skew large, so units-sorted
  // they crowded out everything workable. Off by default, count always shown.
  const [showExcluded, setShowExcluded] = useQueryState(
    "excluded",
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
  // The review facets send-review used to own. Only meaningful with the review
  // density, which is what computes the scored channel they filter on.
  const [verdict, setVerdict] = useQueryState(
    "verdict",
    parseAsStringLiteral(["send", "review", "form", "skip"] as const),
  );
  const [route, setRoute] = useQueryState(
    "route",
    parseAsStringLiteral(["instantly", "form", "none"] as const),
  );
  const [hasDraft, setHasDraft] = useQueryState("draft", parseAsBoolean);
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(0));
  const [showCohortDetail, setShowCohortDetail] = useState(false);
  const [enrichLead, setEnrichLead] = useState<LeadRow | null>(null);
  // Deep-link: ?lead=<domain> opens that lead's drawer (shareable / bookmarkable).
  const [leadParam, setLeadParam] = useQueryState("lead");

  const limit = 50;

  const stats = useQuery(trpc.leads.stats.queryOptions());
  // One poll for everything build-shaped on this page: the strip up top and the
  // per-card status both read it, so neither runs its own interval.
  const buildsInFlight = useQuery(
    trpc.leads.pregenBuildsInFlight.queryOptions(undefined, {
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    }),
  );
  const pmsOptions = useQuery(trpc.leads.pmsOptions.queryOptions());
  // Scoped to the pregen cohorts so the list reads as "reps with target
  // companies", not "reps who happen to own enrichment records".
  const ownerOptions = useQuery(
    trpc.leads.ownerOptions.queryOptions({ pregenOnly: true }),
  );

  const refreshBuild = useMutation(
    trpc.leads.refreshPregenBuild.mutationOptions({
      onSettled: () => void buildsInFlight.refetch(),
    }),
  );
  const list = useQuery(
    trpc.leads.listDomains.queryOptions(
      {
        q: q || undefined,
        source: source ?? undefined,
        pms: pms ?? undefined,
        integratedPmsOnly: integratedOnly || undefined,
        hasPregenSite: hasPregen || undefined,
        enrollableOnly: enrollableOnly || undefined,
        includeExcluded: showExcluded || undefined,
        owner: owner ?? undefined,
        // The review card needs the scored channel and latest draft; the compact
        // row does not, so it does not pay for them.
        withReview: view === "review" || undefined,
        // Scored facets need the scorer, so they only apply in the review
        // density; sending them from the compact list would filter on a payload
        // that was never computed.
        verdict: (view === "review" && verdict) || undefined,
        route: (view === "review" && route) || undefined,
        hasDraft: hasDraft ?? undefined,
        sort,
        dir: sort === "domain" ? "asc" : "desc",
        limit,
        offset: page * limit,
        // Exactly one population, spread LAST so it always wins: the previews
        // population sets hasPregenSite, and with the spread first the facet
        // key's explicit `undefined` silently erased it — pop=previews showed
        // the whole universe.
        ...POPULATIONS[population].input,
      },
      { placeholderData: keepPreviousData },
    ),
  );

  // A search that misses inside a narrow population is the single most common
  // dead end on this page (a domain lives in Whole universe but not in the
  // cohort you happen to be on, and the empty state used to just shrug). When
  // that happens, ask the widest population whether the query matches ANYTHING
  // so the empty state can offer the switch instead of leaving you to guess.
  const emptyWithQuery =
    !!q && population !== "all" && list.data?.items.length === 0;
  const elsewhere = useQuery(
    trpc.leads.listDomains.queryOptions(
      { q, limit: 1 },
      { enabled: emptyWithQuery },
    ),
  );
  const filtersActive =
    !!q ||
    !!source ||
    !!pms ||
    integratedOnly ||
    hasPregen ||
    enrollableOnly ||
    !!owner ||
    hasDraft != null ||
    !!verdict ||
    !!route;
  const clearFilters = () => {
    void setQ("");
    void setSource(null);
    void setPms(null);
    void setIntegratedOnly(false);
    void setHasPregen(false);
    void setEnrollableOnly(false);
    void setOwner(null);
    void setHasDraft(null);
    void setVerdict(null);
    void setRoute(null);
    resetPage();
  };

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
    if (key === "newbatch") return fmt(s.currentBatch);
    if (key === "netnew") return fmt(s.netNew);
    if (key === "send20") return fmt(s.sendBatch);
    if (key === "previews") return fmt(s.withPregenSite);
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

      {/* Above the filters, because an in-flight build is true of the workspace
          rather than of whatever population happens to be selected. Renders
          nothing when nothing is building. */}
      <div className="mt-4">
        <PregenBuildsBanner
          builds={buildsInFlight.data ?? []}
          onRefresh={(buildId) => refreshBuild.mutate({ buildId })}
          refreshing={
            refreshBuild.isPending
              ? (refreshBuild.variables?.buildId ?? null)
              : null
          }
        />
      </div>

      {/* One quiet line for the universe. These are reference numbers looked at
          occasionally, and as six tiles they cost more attention than they earn —
          two of them also duplicated filter pills, so it read as if a tile were a
          control. Details on demand. */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
        <span className="text-muted-foreground">
          {fmt(s?.domains)} domains · {fmt(s?.contacts)} contacts ·{" "}
          {fmt(s?.withPregenSite)} previews · {fmt(s?.ranked)} ranked ·{" "}
          {fmt(s?.integratedPms)} integrated PMS · {fmt(s?.untouched)} not in
          CRM
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
        <Pill
          active={view === "compact"}
          onClick={() => void setView("compact")}
        >
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
            void setSource((event.target.value || null) as typeof source);
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
        <Pill
          active={showExcluded}
          onClick={() => {
            void setShowExcluded(!showExcluded);
            resetPage();
          }}
        >
          {showExcluded
            ? "Hide excluded"
            : `Show excluded${list.data?.excludedHeld ? ` · ${fmt(list.data.excludedHeld)}` : ""}`}
        </Pill>
        <Pill
          active={hasDraft === true}
          onClick={() => {
            void setHasDraft(hasDraft === true ? null : true);
            resetPage();
          }}
        >
          Has draft
        </Pill>
        <Pill
          active={hasDraft === false}
          onClick={() => {
            void setHasDraft(hasDraft === false ? null : false);
            resetPage();
          }}
        >
          Needs draft
        </Pill>
        {/* Verdict and route come out of the scorer, which only the review
            density pays for — offering them over compact rows would filter on a
            payload that was never computed. */}
        {view === "review" ? (
          <>
            <select
              value={verdict ?? ""}
              onChange={(e) => {
                void setVerdict((e.target.value || null) as typeof verdict);
                resetPage();
              }}
              className="border-border bg-background rounded-md border px-2 py-1 text-xs"
            >
              <option value="">Any verdict</option>
              <option value="send">send</option>
              <option value="review">review</option>
              <option value="form">form</option>
              <option value="skip">skip</option>
            </select>
            <select
              value={route ?? ""}
              onChange={(e) => {
                void setRoute((e.target.value || null) as typeof route);
                resetPage();
              }}
              className="border-border bg-background rounded-md border px-2 py-1 text-xs"
            >
              <option value="">Any route</option>
              <option value="instantly">instantly</option>
              <option value="form">form</option>
              <option value="none">none</option>
            </select>
          </>
        ) : null}
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

      {/* result count. A scored facet (verdict/route) is applied per page after
          the scorer runs, so there is no total to quote — say what is on screen
          instead of printing a number the rows cannot account for. */}
      <div className="text-muted-foreground mt-3 text-xs">
        {list.data
          ? `${
              list.data.total == null
                ? `${list.data.items.length} matching on this page`
                : `${fmt(list.data.total)} matching domains`
            }${
              list.data.excludedHeld
                ? ` · ${fmt(list.data.excludedHeld)} excluded and hidden`
                : ""
            } · click a row to inspect & enrich`
          : "Loading…"}
      </div>

      {/* An empty result with filters on gets escape hatches, because
          "0 matching" over a cohort reads as "we don't have this domain" when
          the truth is usually "wrong population" or "a filter you forgot". */}
      {list.data?.items.length === 0 && filtersActive && (
        <div className="border-border mt-3 flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3 text-sm">
          {emptyWithQuery && (elsewhere.data?.total ?? 0) > 0 ? (
            <>
              <span className="text-muted-foreground">
                “{q}” matches {fmt(elsewhere.data!.total)} in Whole universe —
                this population just doesn’t contain it.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void setPopulation("all");
                  resetPage();
                }}
              >
                Search Whole universe
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground">
              Nothing matches the current filters.
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Review cards — the send-review surface as a density level over the same
          filtered set, so the two cannot show different facts about one company
          the way the screenshot-on-one-list-only bug did. */}
      {view === "review" ? (
        <ReviewCardList
          items={list.data?.items ?? []}
          builds={buildsInFlight.data ?? []}
          onInvalidate={() => {
            void list.refetch();
            void buildsInFlight.refetch();
          }}
        />
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
                <th className="border-b px-3 py-2 font-medium">
                  Pre-Gen cohort
                </th>
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

          {list.data?.items.length === 0 && (
            <div className="text-muted-foreground py-12 text-center text-sm">
              No domains match these filters.
            </div>
          )}
        </div>
      )}

      {/* pagination. `total` is null when a scored facet (verdict/route) is on:
          those are computed per page, so the only count we can stand behind is
          what is on screen. Say that rather than print a number the rows below
          cannot account for. */}
      {list.data && (list.data.total == null || list.data.total > limit) && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">
            {list.data.total == null ? (
              <>
                {list.data.items.length} on this page
                {list.data.hasMore ? ", more behind the filter" : ""}
              </>
            ) : (
              <>
                {page * limit + 1}–
                {Math.min((page + 1) * limit, list.data.total)} of{" "}
                {fmt(list.data.total)}
              </>
            )}
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
 * Map a list row onto the shared card's shape.
 *
 * The card deliberately does not know either surface's router output, so this is
 * the only place /app/leads' row shape appears. `review` is null unless the query
 * ran with `withReview`, which is exactly when the review density is active.
 */
function toCardData(item: LeadRow): ProspectCardData | null {
  const review = item.review;
  if (!review) return null;
  const outreach = review.outreach;
  return {
    id: item.id,
    domain: item.domain,
    companyName: item.companyName,
    location:
      [item.city, item.state, item.country].filter(Boolean).join(", ") || null,
    pms: item.pms,
    fitScore: item.scorePregenPotential,
    unitCount: item.unitCount,
    unitConfidence: null,
    contactCount: item.contactCount,
    screenshotUrl: item.siteScreenshotUrl,
    captureTheirsUrl: item.captureTheirsUrl,
    captureOursUrl: item.captureOursUrl,
    rankOverall: item.siteRankOverall,
    pregenSiteUrl: item.pregenSiteUrl,
    excludeReason: item.excludeFromOutreach
      ? (item.excludeReason ?? "excluded")
      : null,
    channel: {
      verdict: review.channel.verdict,
      route: review.channel.route,
      score: review.channel.score,
      bestEmail: review.channel.bestEmail,
      enrollable: review.channel.enrollable
        ? {
            kind: review.channel.enrollable.kind,
            contactId: review.channel.enrollable.contactId,
            email: review.channel.enrollable.email,
            name: review.channel.enrollable.name,
            title: review.channel.enrollable.title,
            score: review.channel.enrollable.score,
            risks: review.channel.enrollable.risks,
          }
        : null,
      reasons: review.channel.reasons,
      risks: review.channel.risks,
      candidates: review.channel.candidates.map((c) => ({
        kind: c.kind,
        contactId: c.contactId,
        email: c.email,
        name: c.name,
        title: c.title,
        score: c.score,
        risks: c.risks,
      })),
    },
    channels: review.channels.map((c) => ({
      kind: c.kind,
      value: c.value,
      deliveryState: c.deliveryState,
    })),
    outreach: outreach
      ? {
          status: outreach.status,
          angle: outreach.angle,
          pretend: outreach.generationContext?.preview.pretend === true,
          recipientName: outreach.generationContext?.recipient?.name ?? null,
          openQuestions: outreach.generationContext?.openQuestions ?? [],
          steps: (outreach.steps ?? []).map((step) => ({
            subject: step.subject,
            body: step.body,
            delayDays: step.delayDays,
          })),
        }
      : null,
  };
}

/**
 * The review density's card list.
 *
 * Mutations are hoisted here rather than created per card, so N rows do not mean
 * N mutation hooks, and `pendingId` keeps the spinner on the row you clicked.
 */
function ReviewCardList({
  items,
  builds,
  onInvalidate,
}: {
  items: LeadRow[];
  builds: InFlightBuild[];
  onInvalidate: () => void;
}) {
  const trpc = useTRPC();
  const [pending, setPending] = useState<{ id: string; kind: string } | null>(
    null,
  );

  /**
   * Refetch the list only.
   *
   * This used to call `queryClient.invalidateQueries()` with no key, so clicking
   * Resolve channel on one card refetched every query on the page — stats, PMS
   * and owner options, the deep-link lookup — none of which any of these
   * mutations can change. `onInvalidate` already refetches the list, which is
   * the one thing that does.
   *
   * ⚠️ Known gap, deliberately not fixed here because it changes an interaction:
   * a refetch re-applies the filter, so a row that no longer matches (generate a
   * draft under "Needs draft") leaves the page and shifts every later row up by
   * one. With offset paging that means page 2 skips a prospect, silently. Two
   * ways out, both a product call: keyset paging, or treat a queue filter as a
   * queue — always read page 0 and let handled rows drain out.
   */
  const settle = () => {
    setPending(null);
    onInvalidate();
  };

  const resolve = useMutation(
    trpc.leads.resolveChannel.mutationOptions({ onSettled: settle }),
  );
  const rank = useMutation(
    trpc.leads.rankDomain.mutationOptions({ onSettled: settle }),
  );
  const generate = useMutation(
    trpc.leads.generatePregenOutreach.mutationOptions({ onSettled: settle }),
  );
  const verify = useMutation(
    trpc.leads.verifyDomainContacts.mutationOptions({ onSettled: settle }),
  );
  const buildPreview = useMutation(
    trpc.leads.requestPregenSite.mutationOptions({ onSettled: settle }),
  );
  // The refusals live server-side, so a rejected enrol surfaces as an error
  // here rather than being pre-empted in the UI. That keeps one list of
  // conditions instead of a copy per surface that can drift.
  const enroll = useMutation(
    trpc.leads.startPregenSequence.mutationOptions({
      onSettled: settle,
      onError: (error) => window.alert(error.message),
      onSuccess: (result) =>
        window.alert(
          `Enrolled ${result.toEmail} in ${result.sequenceName}, sending from ${result.enrolledByEmail}.`,
        ),
    }),
  );

  return (
    <div className="mt-2 space-y-3">
      {items.map((item) => {
        const data = toCardData(item);
        if (!data) return null;
        const busy = (kind: string) =>
          pending?.id === item.id && pending.kind === kind;
        return (
          <ProspectReviewCard
            key={item.id}
            data={data}
            build={builds.find((b) => b.domain === item.domain) ?? null}
            // The full prospect route, not the `?lead=` drawer the compact rows
            // open. A card already shows everything the drawer would, so the
            // useful destination from here is the linkable page — and with
            // review cards now the default view, routing this at the drawer
            // left that page with no way in.
            href={`/app/leads/${encodeURIComponent(item.domain)}`}
            actions={{
              onResolve: (id) => {
                setPending({ id, kind: "resolve" });
                resolve.mutate({ domainId: id });
              },
              onRank: () => {
                setPending({ id: item.id, kind: "rank" });
                rank.mutate({ domain: item.domain, persist: true });
              },
              onGenerate: (id) => {
                setPending({ id, kind: "generate" });
                // No real preview yet for almost every domain, so the card's
                // generate button iterates copy in pretend mode. Publishing
                // refuses these, and the card says so above the touches.
                generate.mutate({
                  domainId: id,
                  pretend: !item.pregenSiteUrl,
                });
              },
              onVerify: (id) => {
                setPending({ id, kind: "verify" });
                verify.mutate({ domainId: id });
              },
              onBuildPreview: (id) => {
                setPending({ id, kind: "build" });
                buildPreview.mutate({ domainId: id });
              },
              onEnroll: (id) => {
                // The contact is the one the channel scorer already selected and
                // the card already shows, so enrolling cannot quietly pick
                // someone the reviewer did not look at.
                const contactId = data.channel?.enrollable?.contactId;
                if (!contactId) return;
                setPending({ id, kind: "enroll" });
                enroll.mutate({
                  domainId: id,
                  contactId,
                  senderEmail: PREGEN_SEQUENCE_SENDER_EMAIL,
                });
              },
              resolving: busy("resolve"),
              ranking: busy("rank"),
              generating: busy("generate"),
              verifying: busy("verify"),
              building: busy("build"),
              enrolling: busy("enroll"),
            }}
          />
        );
      })}
      {items.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Nothing in this population matches those facets.
        </p>
      )}
    </div>
  );
}
