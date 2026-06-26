"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarClock,
  CircleDot,
  FileText,
  Layers,
  Loader2,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  Radio,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/copy-button";
import { type RouterInputs, type RouterOutputs, useTRPC } from "@/trpc/react";

/**
 * Typed result cards for the /overview assistant's read-only tools.
 *
 * The chat (OverviewChat) renders each `tool-<name>` part through `renderToolPart`,
 * which dispatches to the matching card here. Cards are the growth-domain analogue
 * of Capient's IqToolCards — built for THIS app's capabilities (workspace snapshot,
 * brands, content pipeline, leads, listening) rather than ported wholesale. Any
 * tool without a typed card falls back to <GenericToolCard> (collapsible JSON), so
 * adding a capability never breaks the surface — you just upgrade it when it earns one.
 *
 * Output types mirror the capability handlers in
 * `src/server/ai/capabilities/*`. Dates arrive JSON-serialized (ISO strings).
 */

// ── Output shapes (mirror the server capabilities) ─────────────────────────

type StatusCount = { status: string; count: number };

export interface WorkspaceOverviewOutput {
  brands: number;
  content: { total: number; byStatus: StatusCount[]; needsAttention: number };
  leads: { domains: number; contacts: number; netNew: number; inInstantly: number };
  engageWorthyMentions: number;
}

export interface ListBrandsOutput {
  brands: { id: string; name: string; tagline: string | null }[];
}

export interface ContentPipelineOutput {
  total: number;
  byStatus: StatusCount[];
}

export interface UpcomingContentOutput {
  posts: {
    id: string;
    title: string | null;
    brandId: string;
    status: string;
    pillar: string | null;
    plannedAt: string | null;
  }[];
}

export interface LeadsSummaryOutput {
  domains: number;
  inHubspot: number;
  inInstantly: number;
  inPregen: number;
  withPregenSite: number;
  untouched: number;
  contacts: number;
  netNew: number;
  topPms: { pms: string | null; count: number }[];
}

export interface MentionsOutput {
  count: number;
  mentions: {
    id: string;
    title: string | null;
    source: string;
    subreddit: string | null;
    author: string | null;
    url: string | null;
    keyword: string | null;
    relevance: number | null;
    intentTag: string | null;
    suggestedAction: string | null;
    status: string;
    receivedAt: string | null;
  }[];
}

// Ads — mirror src/server/services/ads-analytics.service.ts return shapes.
type AdsBucket = {
  key: string;
  ads: number;
  impressions: number;
  clicks: number;
  engagement: number;
  spend: number;
  ctr: number; // 0..1
};

export interface AdsScopeOutput {
  window: { fromDate: string; toDate: string };
  account: { id?: string; name?: string };
  totals: {
    ads: number;
    allAds: number;
    impressions: number;
    clicks: number;
    ctr: number; // 0..1
    spend: number;
    engagement: number;
    conversions: number;
  };
  byMonth: { month: string; ads: number; impressions: number; clicks: number; spend: number }[];
  byObjective: AdsBucket[];
  byDestination: AdsBucket[];
  flags: { hasAuditAds: boolean; hasOsAds: boolean };
}

export interface RankedAd {
  id: string;
  name: string | null;
  campaign: string | null;
  objective: string;
  destination: string;
  status: string | null;
  link: string | null;
  thumbnailUrl: string | null;
  created: string | null;
  impressions: number;
  clicks: number;
  ctr: number; // percent
  engagement: number;
  spend: number;
  conversions: number;
  cpc: number;
  body: string;
}

export interface AdsRankedOutput {
  window: { fromDate: string; toDate: string };
  filters: {
    objective?: string;
    destination?: string;
    status: string;
    metric: string;
    limit: number;
  };
  matched: number;
  ads: RankedAd[];
}

// ── Shared primitives ──────────────────────────────────────────────────────

/** The dashed "running…" placeholder shown while a tool call is in flight. */
export function ToolCallPending({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {label}
    </div>
  );
}

/** Card chrome: icon-chip + title header, optional "view" deep-link, body slot. */
function ToolCard({
  icon: Icon,
  title,
  href,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  href?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card text-card-foreground overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary grid size-6 shrink-0 place-items-center rounded-md">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-medium">{title}</span>
          {hint && (
            <span className="text-muted-foreground text-xs">{hint}</span>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-xs"
          >
            View
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}

/** A labelled metric tile; whole tile is a deep-link when `href` is set. */
function Stat({
  label,
  value,
  sub,
  subTone = "muted",
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  subTone?: "muted" | "amber" | "emerald";
  href?: string;
}) {
  const body = (
    <>
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {sub && (
        <p
          className={cn(
            "mt-0.5 text-xs",
            subTone === "amber" && "text-amber-600 dark:text-amber-400",
            subTone === "emerald" && "text-emerald-600 dark:text-emerald-400",
            subTone === "muted" && "text-muted-foreground",
          )}
        >
          {sub}
        </p>
      )}
    </>
  );
  const className = cn(
    "rounded-lg border px-3 py-2.5",
    href && "hover:border-foreground/20 hover:bg-muted/40 transition-colors",
  );
  return href ? (
    <Link href={href} className={cn(className, "block")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

// ── Content-status presentation ────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  slot: { label: "Slot", dot: "bg-muted-foreground/40", badge: "bg-muted text-muted-foreground" },
  draft: { label: "Draft", dot: "bg-amber-400", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  discovered: { label: "Discovered", dot: "bg-violet-400", badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  pending_review: { label: "Needs review", dot: "bg-orange-400", badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  approved: { label: "Approved", dot: "bg-sky-400", badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  scheduled: { label: "Scheduled", dot: "bg-blue-400", badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  published: { label: "Published", dot: "bg-emerald-400", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Rejected", dot: "bg-red-400", badge: "bg-red-500/10 text-red-600 dark:text-red-400" },
  archived: { label: "Archived", dot: "bg-muted-foreground/30", badge: "bg-muted text-muted-foreground" },
};

const statusMeta = (s: string) =>
  STATUS_META[s] ?? {
    label: s.replace(/_/g, " "),
    dot: "bg-muted-foreground/40",
    badge: "bg-muted text-muted-foreground",
  };

const ACTION_META: Record<string, { label: string; badge: string }> = {
  engage: { label: "Engage", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  monitor: { label: "Monitor", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  skip: { label: "Skip", badge: "bg-muted text-muted-foreground" },
};

function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", m.badge)}>
      {m.label}
    </span>
  );
}

const fmtDate = (value: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const fmtNum = (n: number) => n.toLocaleString("en-US");

// ── Cards ────────────────────────────────────────────────────────────────

/** The home snapshot — `workspaceOverview`. Four deep-linked metric tiles. */
export function WorkspaceOverviewCard({ output }: { output: WorkspaceOverviewOutput }) {
  const { brands, content, leads, engageWorthyMentions } = output;
  return (
    <ToolCard icon={Sparkles} title="Workspace snapshot">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Brands" value={brands} href="/app/brands" />
        <Stat
          label="Content"
          value={fmtNum(content.total)}
          sub={
            content.needsAttention > 0
              ? `${content.needsAttention} need attention`
              : "all triaged"
          }
          subTone={content.needsAttention > 0 ? "amber" : "muted"}
          href="/app/content"
        />
        <Stat
          label="Leads"
          value={fmtNum(leads.domains)}
          sub={`${fmtNum(leads.netNew)} sendable`}
          subTone={leads.netNew > 0 ? "emerald" : "muted"}
          href="/app/leads"
        />
        <Stat
          label="To engage"
          value={engageWorthyMentions}
          sub="social mentions"
          subTone={engageWorthyMentions > 0 ? "emerald" : "muted"}
          href="/app/listen"
        />
      </div>
    </ToolCard>
  );
}

/** `listBrands` — name + tagline rows. */
export function BrandsCard({ output }: { output: ListBrandsOutput }) {
  const { brands } = output;
  return (
    <ToolCard
      icon={Layers}
      title="Brands"
      href="/app/brands"
      hint={`${brands.length}`}
    >
      {brands.length === 0 ? (
        <p className="text-muted-foreground text-sm">No brands yet.</p>
      ) : (
        <ul className="divide-y">
          {brands.map((b) => (
            <li key={b.id} className="flex items-baseline gap-2 py-1.5 first:pt-0 last:pb-0">
              <span className="text-sm font-medium">{b.name}</span>
              {b.tagline && (
                <span className="text-muted-foreground truncate text-xs">
                  {b.tagline}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </ToolCard>
  );
}

/** `contentPipelineSummary` — segmented bar + per-status legend. */
export function ContentPipelineCard({ output }: { output: ContentPipelineOutput }) {
  const { total, byStatus } = output;
  const sorted = [...byStatus].sort((a, b) => b.count - a.count);
  return (
    <ToolCard
      icon={FileText}
      title="Content pipeline"
      href="/app/content"
      hint={`${fmtNum(total)} posts`}
    >
      {total === 0 ? (
        <p className="text-muted-foreground text-sm">Pipeline is empty.</p>
      ) : (
        <>
          <div className="bg-muted flex h-2 w-full overflow-hidden rounded-full">
            {sorted.map((s) => (
              <div
                key={s.status}
                className={statusMeta(s.status).dot}
                style={{ width: `${(s.count / total) * 100}%` }}
                title={`${statusMeta(s.status).label}: ${s.count}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {sorted.map((s) => (
              <div key={s.status} className="flex items-center gap-1.5 text-xs">
                <span className={cn("size-2 rounded-full", statusMeta(s.status).dot)} />
                <span className="text-muted-foreground">{statusMeta(s.status).label}</span>
                <span className="font-medium tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </ToolCard>
  );
}

/** `upcomingContent` — soonest-first rows with date chip + status. */
export function UpcomingContentCard({ output }: { output: UpcomingContentOutput }) {
  const { posts } = output;
  return (
    <ToolCard
      icon={CalendarClock}
      title="Coming up"
      href="/app/calendar"
      hint={`${posts.length}`}
    >
      {posts.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing planned ahead.</p>
      ) : (
        <ul className="divide-y">
          {posts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <span className="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">
                {fmtDate(p.plannedAt)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {p.title?.trim() || (
                  <span className="text-muted-foreground italic">Untitled</span>
                )}
                {p.pillar && (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    · {p.pillar}
                  </span>
                )}
              </span>
              <StatusBadge status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </ToolCard>
  );
}

/** `leadsSummary` — headline tiles + top-PMS mini bars. */
export function LeadsSummaryCard({ output }: { output: LeadsSummaryOutput }) {
  const { domains, contacts, netNew, untouched, inInstantly, inHubspot, topPms } = output;
  const pmsMax = Math.max(1, ...topPms.map((p) => p.count));
  return (
    <ToolCard icon={Users} title="Leads pool" href="/app/leads">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Domains" value={fmtNum(domains)} />
        <Stat label="Contacts" value={fmtNum(contacts)} />
        <Stat
          label="Net-new sendable"
          value={fmtNum(netNew)}
          subTone="emerald"
          sub={netNew > 0 ? "ready to send" : undefined}
        />
        <Stat label="Untouched pool" value={fmtNum(untouched)} />
        <Stat label="In Instantly" value={fmtNum(inInstantly)} />
        <Stat label="In HubSpot" value={fmtNum(inHubspot)} />
      </div>
      {topPms.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
            Top PMS platforms
          </p>
          <div className="space-y-1.5">
            {topPms.map((p) => (
              <div key={p.pms ?? "unknown"} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 truncate">{p.pms ?? "Unknown"}</span>
                <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary/60 h-full rounded-full"
                    style={{ width: `${(p.count / pmsMax) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-medium tabular-nums">
                  {fmtNum(p.count)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolCard>
  );
}

/** `recentMentions` — listening queue rows with source, action, relevance. */
export function MentionsCard({ output }: { output: MentionsOutput }) {
  const { mentions, count } = output;
  return (
    <ToolCard
      icon={Radio}
      title="Social mentions"
      href="/app/listen"
      hint={`${count}`}
    >
      {mentions.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing in the queue.</p>
      ) : (
        <ul className="divide-y">
          {mentions.map((m) => {
            const action = m.suggestedAction
              ? (ACTION_META[m.suggestedAction] ?? {
                  label: m.suggestedAction,
                  badge: "bg-muted text-muted-foreground",
                })
              : null;
            const where = m.subreddit ? `r/${m.subreddit}` : m.source;
            const Row = (
              <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                <MessageCircle className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {m.title?.trim() || (
                      <span className="text-muted-foreground italic">No title</span>
                    )}
                  </p>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="uppercase">{where}</span>
                    {m.author && <span>· {m.author}</span>}
                    <span>· {fmtDate(m.receivedAt)}</span>
                    {typeof m.relevance === "number" && (
                      <span className="inline-flex items-center gap-0.5">
                        · <CircleDot className="h-2.5 w-2.5" />
                        {m.relevance <= 1 ? Math.round(m.relevance * 100) : m.relevance}
                      </span>
                    )}
                  </p>
                </div>
                {action && (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
                      action.badge,
                    )}
                  >
                    {action.label}
                  </span>
                )}
              </div>
            );
            return (
              <li key={m.id}>
                {m.url ? (
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:bg-muted/40 -mx-1 block rounded px-1"
                  >
                    {Row}
                  </a>
                ) : (
                  Row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ToolCard>
  );
}

// ── Ads cards ──────────────────────────────────────────────────────────────

const OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_SALES: "Sales · consumer",
  OUTCOME_LEADS: "Leads · PM/WanderOS",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_APP_PROMOTION: "App promotion",
  POST_ENGAGEMENT: "Post engagement",
  "(none)": "Uncategorized",
};
const objectiveLabel = (o: string) => OBJECTIVE_LABEL[o] ?? o;

const DESTINATION_LABEL: Record<string, string> = {
  audit: "Audit",
  os: "WanderOS · /os",
  list: "List",
  marketplace: "Marketplace",
  "other-link": "Other link",
  "lead-form": "Lead form · on-Meta",
  engagement: "Engagement",
  unknown: "No link surfaced",
};
const destinationLabel = (d: string) => DESTINATION_LABEL[d] ?? d;

const METRIC_LABEL: Record<string, string> = {
  impressions: "impressions",
  clicks: "clicks",
  ctr: "CTR",
  engagement: "engagement",
  spend: "spend",
};

const fmtUsd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${fmtNum(Math.round(n))}`;

const fmtPct = (ratio: number) => `${(ratio * 100).toFixed(2)}%`;

const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString("en-US", { month: "short" }) + ` '${y?.slice(2)}`;
};

const fmtWindow = (w: { fromDate: string; toDate: string }) => {
  const f = new Date(w.fromDate);
  const t = new Date(w.toDate);
  const opt: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
  return `${f.toLocaleDateString("en-US", opt)} – ${t.toLocaleDateString("en-US", opt)}`;
};

/** label · bar · value/CTR row, reused for objective + destination breakdowns. */
function BreakdownBars({
  rows,
  label,
  max,
}: {
  rows: AdsBucket[];
  label: (key: string) => string;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 text-xs">
          <span className="w-32 shrink-0 truncate">{label(r.key)}</span>
          <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-primary/60 h-full rounded-full"
              style={{ width: `${(r.impressions / max) * 100}%` }}
            />
          </div>
          <span className="text-muted-foreground w-28 shrink-0 text-right tabular-nums">
            {fmtNum(r.impressions)} · {fmtPct(r.ctr)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** `adsScope` — totals + destination/objective breakdowns + audit flag. */
export function AdsScopeCard({ output }: { output: AdsScopeOutput }) {
  const { totals, byDestination, byObjective, byMonth, flags, window } = output;
  const destMax = Math.max(1, ...byDestination.map((d) => d.impressions));
  const objMax = Math.max(1, ...byObjective.map((o) => o.impressions));
  const monthMax = Math.max(1, ...byMonth.map((m) => m.impressions));
  return (
    <ToolCard
      icon={Megaphone}
      title="Ad performance"
      hint={fmtWindow(window)}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Impressions" value={fmtNum(totals.impressions)} />
        <Stat label="Clicks" value={fmtNum(totals.clicks)} sub={fmtPct(totals.ctr)} />
        <Stat label="Spend" value={fmtUsd(totals.spend)} />
        <Stat
          label="Ads delivered"
          value={fmtNum(totals.ads)}
          sub={`of ${fmtNum(totals.allAds)}`}
        />
      </div>

      {!flags.hasAuditAds && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          No <span className="font-medium">audit</span>-destination ads ran in this window — that angle would be net-new.
        </p>
      )}

      {byDestination.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
            By destination · impressions · CTR
          </p>
          <BreakdownBars rows={byDestination} label={destinationLabel} max={destMax} />
        </div>
      )}

      {byObjective.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
            By objective
          </p>
          <BreakdownBars rows={byObjective} label={objectiveLabel} max={objMax} />
        </div>
      )}

      {byMonth.length > 1 && (
        <div className="mt-3 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
            Impressions by launch month
          </p>
          <div className="flex items-end gap-1" style={{ height: 40 }}>
            {byMonth.map((m) => (
              <div
                key={m.month}
                className="flex flex-1 flex-col items-center justify-end gap-1"
                title={`${fmtMonth(m.month)}: ${fmtNum(m.impressions)} impr · ${fmtUsd(m.spend)}`}
              >
                <div
                  className="bg-primary/50 w-full rounded-sm"
                  style={{ height: `${Math.max(2, (m.impressions / monthMax) * 32)}px` }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolCard>
  );
}

const DEST_CHIP =
  "rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground";

/** A single ranked-ad row: thumbnail + name + metrics + truncated copy. */
function RankedAdRow({ ad }: { ad: RankedAd }) {
  const link = ad.link ?? undefined;
  const Name = (
    <span className="truncate text-sm font-medium" title={ad.name ?? undefined}>
      {ad.name ?? "(unnamed ad)"}
    </span>
  );
  return (
    <li className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      {ad.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.thumbnailUrl}
          alt=""
          className="bg-muted size-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="bg-muted grid size-12 shrink-0 place-items-center rounded-md">
          <Megaphone className="text-muted-foreground h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="hover:underline truncate text-sm font-medium"
              title={ad.name ?? undefined}
            >
              {ad.name ?? "(unnamed ad)"}
            </a>
          ) : (
            Name
          )}
          <span className={DEST_CHIP}>{destinationLabel(ad.destination)}</span>
        </div>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
          <span>{fmtNum(ad.impressions)} impr</span>
          <span>· {fmtNum(ad.clicks)} clicks</span>
          <span>· {ad.ctr}% CTR</span>
          <span>· {fmtNum(ad.engagement)} eng</span>
          <span>· {fmtUsd(ad.spend)}</span>
          {ad.created && <span>· {ad.created}</span>}
        </p>
        {ad.body && (
          <p className="text-muted-foreground/90 mt-1 line-clamp-2 text-xs italic">
            “{ad.body}”
          </p>
        )}
      </div>
    </li>
  );
}

function rankedDigest(out: AdsRankedOutput): string {
  const lines = [
    `# Wander top ads — ${fmtWindow(out.window)}`,
    `Ranked by ${METRIC_LABEL[out.filters.metric] ?? out.filters.metric}` +
      `${out.filters.objective ? ` · objective ${out.filters.objective}` : ""}` +
      `${out.filters.destination ? ` · destination ${out.filters.destination}` : ""}` +
      ` · ${out.matched} matched`,
    "",
    ...out.ads.map(
      (a, i) =>
        `${i + 1}. [${destinationLabel(a.destination)}] ${a.name ?? "(unnamed)"} — ` +
        `${fmtNum(a.impressions)} impr, ${fmtNum(a.clicks)} clicks, ${a.ctr}% CTR, ${fmtUsd(a.spend)}` +
        `${a.body ? `\n   "${a.body}"` : ""}`,
    ),
  ];
  return lines.join("\n");
}

type TopAdsInput = RouterInputs["ads"]["topAds"];
type Metric = NonNullable<TopAdsInput["metric"]>;
type StatusFilter = NonNullable<TopAdsInput["status"]>;

const METRIC_OPTIONS: Metric[] = ["impressions", "clicks", "ctr", "engagement", "spend"];
const STATUS_OPTIONS: StatusFilter[] = ["all", "active", "non-paused"];
const OBJECTIVE_OPTIONS = [
  "OUTCOME_SALES",
  "OUTCOME_LEADS",
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
] as const;
const DESTINATION_OPTIONS = Object.keys(DESTINATION_LABEL);

/** Compact native select styled to match the card chrome. */
function MiniSelect({
  value,
  onChange,
  children,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <select
      title={title}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-border bg-background text-foreground h-7 rounded-md border px-1.5 text-[11px]"
    >
      {children}
    </select>
  );
}

/**
 * `topAds` — ranked creative rows with INTERACTIVE controls (Tier 2). First
 * paint is the chat tool's output (seeded as `initialData`); changing a control
 * refetches in place through the `ads` tRPC router — same compute, no LLM
 * round-trip, no new chat messages.
 */
export function AdsRankedCard({ output }: { output: AdsRankedOutput }) {
  const trpc = useTRPC();
  const [metric, setMetric] = useState<Metric>(output.filters.metric as Metric);
  const [status, setStatus] = useState<StatusFilter>(
    output.filters.status as StatusFilter,
  );
  const [objective, setObjective] = useState(output.filters.objective ?? "");
  const [destination, setDestination] = useState(output.filters.destination ?? "");

  const input: TopAdsInput = {
    fromDate: output.window.fromDate,
    toDate: output.window.toDate,
    objective: objective || undefined,
    destination: (destination || undefined) as TopAdsInput["destination"],
    status,
    metric,
    limit: output.filters.limit,
  };

  const { data, isFetching } = useQuery({
    ...trpc.ads.topAds.queryOptions(input),
    initialData: output as RouterOutputs["ads"]["topAds"],
  });

  const view: AdsRankedOutput = data ?? output;
  const { ads, matched, window } = view;

  return (
    <ToolCard
      icon={TrendingUp}
      title={`Top ads · by ${METRIC_LABEL[metric] ?? metric}`}
      hint={`${ads.length} of ${matched}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <MiniSelect value={metric} onChange={(v) => setMetric(v as Metric)} title="Rank by">
          {METRIC_OPTIONS.map((m) => (
            <option key={m} value={m}>
              by {METRIC_LABEL[m] ?? m}
            </option>
          ))}
        </MiniSelect>
        <MiniSelect
          value={objective}
          onChange={setObjective}
          title="Objective"
        >
          <option value="">All funnels</option>
          {OBJECTIVE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {objectiveLabel(o)}
            </option>
          ))}
        </MiniSelect>
        <MiniSelect
          value={destination}
          onChange={setDestination}
          title="Destination"
        >
          <option value="">Any destination</option>
          {DESTINATION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {destinationLabel(d)}
            </option>
          ))}
        </MiniSelect>
        <MiniSelect value={status} onChange={(v) => setStatus(v as StatusFilter)} title="Status">
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </MiniSelect>
        {isFetching && <Loader2 className="text-muted-foreground h-3.5 w-3.5 animate-spin" />}
        <span className="ml-auto">
          {ads.length > 0 && <CopyButton text={rankedDigest(view)} label="Copy" />}
        </span>
      </div>
      <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[11px]">
        <Target className="h-3 w-3" />
        {fmtWindow(window)}
      </p>
      {ads.length === 0 ? (
        <p className="text-muted-foreground text-sm">No ads match this scope.</p>
      ) : (
        <ul className="divide-y">
          {ads.map((ad) => (
            <RankedAdRow key={ad.id} ad={ad} />
          ))}
        </ul>
      )}
    </ToolCard>
  );
}

/** Fallback for any tool without a typed card yet — collapsible raw JSON. */
export function GenericToolCard({
  name,
  output,
}: {
  name: string;
  output: unknown;
}) {
  return (
    <details className="bg-card rounded-lg border px-3.5 py-2.5">
      <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
        {name}
      </summary>
      <pre className="mt-2 overflow-x-auto text-xs">
        {JSON.stringify(output, null, 2)}
      </pre>
    </details>
  );
}
