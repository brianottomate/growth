"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CircleDot,
  FileText,
  Layers,
  Loader2,
  type LucideIcon,
  MessageCircle,
  Radio,
  Sparkles,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

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
