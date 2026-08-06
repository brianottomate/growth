"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Gauge,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { sendAssistantIntent } from "@/lib/assistant-events";

/**
 * The one prospect review card.
 *
 * Both /app/leads (review density) and /app/leads/send-review render this, so a
 * card here and a card there cannot disagree — the same reason `listDomains`
 * runs the send-review scorer rather than a second one. /app/leads previously
 * reimplemented a thinner version of this and immediately drifted: no site
 * thumbnail, no evidence chips, a flat list of emails instead of the candidate
 * table, a truncated angle instead of the touches, and no actions at all.
 *
 * Callers pass a normalised `ProspectCardData` instead of their own router row,
 * so neither surface's query shape leaks in here and send-review stays a
 * deletable route.
 */

export type ProspectVerdict = "send" | "review" | "form" | "skip";
export type ProspectRoute = "instantly" | "form" | "none";

export interface ProspectCandidate {
  kind: string;
  email: string;
  name: string | null;
  title: string | null;
  score: number;
  risks: string[];
}

export interface ProspectChannel {
  kind: string;
  value: string;
  deliveryState: string | null;
}

export interface ProspectCardData {
  id: string;
  domain: string;
  companyName: string | null;
  location: string | null;
  pms: string | null;
  fitScore: number | null;
  unitCount: number | null;
  unitConfidence: string | null;
  contactCount: number;
  screenshotUrl: string | null;
  rankOverall: number | null;
  pregenSiteUrl: string | null;
  excludeReason: string | null;
  channel: {
    verdict: ProspectVerdict;
    route: ProspectRoute;
    score: number;
    bestEmail: string | null;
    reasons: string[];
    risks: string[];
    candidates: ProspectCandidate[];
  };
  channels: ProspectChannel[];
  outreach: {
    status: string;
    angle: string | null;
    /** True when the draft was written against a stand-in preview. */
    pretend: boolean;
    steps: Array<{
      subject: string | null;
      body: string;
      delayDays: number;
    }>;
  } | null;
}

const channelMeta: Record<string, { Icon: LucideIcon; label: string }> = {
  email: { Icon: Mail, label: "email" },
  phone: { Icon: Phone, label: "phone" },
  form: { Icon: FileText, label: "form" },
  chatbot: { Icon: MessageCircle, label: "chat" },
  sms: { Icon: MessageCircle, label: "sms" },
};

const fmt = (n: number | null | undefined) =>
  n == null ? "-" : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;

// Verdict drives the whole card's visual language: a colored left rail, the
// score-ring border, the plain-language verb, and the badge. Skip is neutral
// grey (not red) — a skip isn't an error, it's just "not this one".
type VerdictTheme = {
  rail: string;
  border: string;
  text: string;
  badge: string;
  verb: string;
  Icon: LucideIcon;
};

export const verdictTheme: Record<ProspectVerdict, VerdictTheme> = {
  send: {
    rail: "bg-emerald-500",
    border: "border-emerald-500",
    text: "text-emerald-400",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    verb: "Send now",
    Icon: CheckCircle2,
  },
  review: {
    rail: "bg-amber-500",
    border: "border-amber-500",
    text: "text-amber-400",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    verb: "Needs a look",
    Icon: Mail,
  },
  form: {
    rail: "bg-sky-500",
    border: "border-sky-500",
    text: "text-sky-400",
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    verb: "Use contact form",
    Icon: FileText,
  },
  skip: {
    rail: "bg-muted-foreground/40",
    border: "border-muted-foreground/50",
    text: "text-muted-foreground",
    badge: "border-border bg-muted text-muted-foreground",
    verb: "Skip",
    Icon: ShieldAlert,
  },
};

function ChannelBadges({ channels }: { channels: ProspectChannel[] }) {
  if (!channels.length) {
    return (
      <span className="text-muted-foreground text-xs">
        No channels captured yet
      </span>
    );
  }
  const counts = new Map<string, number>();
  for (const channel of channels) {
    counts.set(channel.kind, (counts.get(channel.kind) ?? 0) + 1);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {[...counts].map(([kind, count]) => {
        const meta = channelMeta[kind] ?? { Icon: FileText, label: kind };
        return (
          <span
            key={kind}
            className="border-border text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
          >
            <meta.Icon className="size-3" />
            {meta.label}
            {count > 1 ? ` · ${count}` : ""}
          </span>
        );
      })}
    </div>
  );
}

function EvidenceList({ data }: { data: ProspectCardData }) {
  const evidence = [
    ...data.channel.reasons.map((reason) => ({ kind: "good", text: reason })),
    ...data.channel.risks.map((risk) => ({ kind: "risk", text: risk })),
  ].slice(0, 5);

  if (!evidence.length) {
    return (
      <span className="text-muted-foreground text-xs">
        No channel evidence yet
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {evidence.map((item, index) => (
        <span
          key={`${item.kind}-${index}`}
          className={`rounded px-1.5 py-0.5 text-[10px] ${
            item.kind === "good"
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-red-500/10 text-red-300"
          }`}
        >
          {item.text}
        </span>
      ))}
    </div>
  );
}

/**
 * The prospect's current site, as captured by the lead ranker.
 *
 * Standing in for the finished pregen preview thumbnail we actually want here.
 * Silent when a domain has not been ranked — which is still most of them, so the
 * card must read correctly with no image at all.
 */
function SiteThumbnail({ data }: { data: ProspectCardData }) {
  if (!data.screenshotUrl) return null;
  return (
    <div className="shrink-0">
      <div className="border-border bg-muted relative h-20 w-32 overflow-hidden rounded-md border">
        <Image
          src={data.screenshotUrl}
          alt={`Current site for ${data.domain}`}
          fill
          sizes="128px"
          className="object-cover object-top"
          unoptimized
        />
      </div>
      {typeof data.rankOverall === "number" && (
        <div className="text-muted-foreground mt-1 text-center text-[10px] tabular-nums">
          rank {data.rankOverall}
        </div>
      )}
    </div>
  );
}

function SequencePreview({ data }: { data: ProspectCardData }) {
  const outreach = data.outreach;
  if (!outreach?.steps.length) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
        No sequence draft yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* A pretend draft describes a page that does not exist. Publishing
          refuses it, but a reviewer reading four polished touches needs to know
          that before they form an opinion of the copy — not after. */}
      {outreach.pretend && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
          Written against a stand-in preview, so anything it says about the page
          itself is invented. Not publishable — regenerate once a real preview
          is assigned.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>
          <span className="text-muted-foreground">Angle:</span>{" "}
          {outreach.angle ?? "-"}
        </span>
        {data.pregenSiteUrl && (
          <a
            href={data.pregenSiteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] underline"
          >
            Open the preview they will see ↗
          </a>
        )}
      </div>
      {/* A vertical stack, not a grid: touches are read in order, and a 2-up
          grid left every card as tall as its neighbour with dead space beside
          the short ones. Full bodies stay unclamped — approving copy that goes
          out as a named person is the whole job, so a truncated body is not a
          review. */}
      <div className="space-y-2">
        {outreach.steps.slice(0, 4).map((step, index) => (
          <div key={index} className="rounded-md border p-2">
            <div className="text-muted-foreground flex items-center justify-between gap-2 text-[10px] font-medium">
              <span>
                Touch {index + 1}
                {step.subject ? ` · ${step.subject}` : " · in-thread reply"}
              </span>
              <span className="tabular-nums">
                {step.delayDays === 0 ? "day 0" : `day ${step.delayDays}`}
              </span>
            </div>
            {/* A signed preview URL is one long unbroken token, which
                whitespace-pre-wrap alone will happily run past the container —
                anywhere lets it break mid-token. */}
            <pre className="mt-1 font-sans text-xs leading-relaxed [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
              {step.body}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  busy,
  Icon,
  title,
  children,
}: {
  onClick: () => void;
  busy?: boolean;
  Icon: LucideIcon;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={title}
      className="border-border inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Icon className="size-3.5" />
      )}
      {children}
    </button>
  );
}

export interface ProspectCardActions {
  onResolve?: (id: string) => void;
  onGenerate?: (id: string) => void;
  onVerify?: (id: string) => void;
  onRank?: (id: string) => void;
  /** Ask WanderOS to build a pregen site. Async — reports back over the webhook. */
  onBuildPreview?: (id: string) => void;
  resolving?: boolean;
  generating?: boolean;
  verifying?: boolean;
  ranking?: boolean;
  building?: boolean;
}

export function ProspectReviewCard({
  data,
  actions = {},
  /** Link the domain name at something useful for the host surface. */
  href,
}: {
  data: ProspectCardData;
  actions?: ProspectCardActions;
  href?: string;
}) {
  const theme = verdictTheme[data.channel.verdict];
  const bestEmail = data.channel.bestEmail;

  /**
   * Workflows that are a conversation rather than a single call.
   *
   * A button that files a chat message keeps the heavy, multi-step jobs out of
   * the card — the operator states the goal and the assistant sequences it,
   * which is the same delegation the blog agent uses. The card stays a review
   * surface instead of accumulating a button per capability.
   */
  const ask = (visibleText: string) =>
    sendAssistantIntent({
      type: "work_prospect",
      domain: data.domain,
      companyName: data.companyName,
      visibleText,
    });

  return (
    <section className="bg-card mb-3.5 flex overflow-hidden rounded-xl border">
      <span className={`w-1 shrink-0 ${theme.rail}`} aria-hidden />
      <div className="min-w-0 flex-1 space-y-5 p-5">
        {/* decision header — the verdict is the hero */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div className="flex min-w-0 gap-3.5">
            <SiteThumbnail data={data} />
            <div
              className={`grid size-11 shrink-0 place-items-center rounded-full border-2 ${theme.border}`}
            >
              <span className="text-foreground text-base font-medium tabular-nums">
                {data.channel.score}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-medium ${theme.text}`}>
                  {theme.verb}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${theme.badge}`}
                >
                  <theme.Icon className="size-3" />
                  {data.channel.verdict}
                </span>
                {data.excludeReason && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300">
                    excluded · {data.excludeReason}
                  </span>
                )}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                {href ? (
                  <Link
                    href={href}
                    className="truncate font-medium hover:underline"
                  >
                    {data.domain}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{data.domain}</span>
                )}
                <a
                  href={`https://${data.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <ArrowUpRight className="size-3.5" />
                </a>
                <span className="text-muted-foreground truncate text-xs">
                  · {data.companyName ?? "Unknown company"}
                  {data.location ? ` · ${data.location}` : ""}
                  {data.pms ? ` · ${data.pms}` : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
            <div>fit {fmt(data.fitScore)}</div>
            <div>
              units {fmt(data.unitCount)}
              {data.unitConfidence ? ` · ${data.unitConfidence}` : ""}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,1.15fr)]">
          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-muted-foreground text-[11px] font-medium">
                  Selected channel
                </div>
                <div className="mt-1 text-sm">
                  {bestEmail ? (
                    <span className="font-medium">{bestEmail}</span>
                  ) : data.channel.route === "form" ? (
                    <span className="font-medium">Contact form</span>
                  ) : (
                    <span className="text-muted-foreground">Not resolved</span>
                  )}
                </div>
                <div className="text-muted-foreground mt-0.5 text-[11px]">
                  {data.channel.route} · {data.contactCount} stored contacts
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-[11px] font-medium">
                  Evidence
                </div>
                <div className="mt-1">
                  <EvidenceList data={data} />
                </div>
              </div>
            </div>

            <div>
              <div className="text-muted-foreground text-[11px] font-medium">
                Reachability
              </div>
              <div className="mt-1">
                <ChannelBadges channels={data.channels} />
              </div>
            </div>

            {data.channel.candidates.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground text-left">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Candidate</th>
                      <th className="px-3 py-1 font-medium">Source</th>
                      <th className="px-3 py-1 text-right font-medium">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.channel.candidates.slice(0, 4).map((candidate) => (
                      <tr key={`${candidate.kind}-${candidate.email}`}>
                        <td className="border-t py-1 pr-3">
                          <div className="font-medium">{candidate.email}</div>
                          {(candidate.name || candidate.title) && (
                            <div className="text-muted-foreground">
                              {[candidate.name, candidate.title]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                          {candidate.risks.length > 0 && (
                            <div className="text-red-300/80">
                              {candidate.risks[0]}
                            </div>
                          )}
                        </td>
                        <td className="text-muted-foreground border-t px-3 py-1">
                          {candidate.kind}
                        </td>
                        <td className="border-t px-3 py-1 text-right tabular-nums">
                          {candidate.score}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {actions.onResolve && (
                <ActionButton
                  onClick={() => actions.onResolve!(data.id)}
                  busy={actions.resolving}
                  Icon={RefreshCw}
                >
                  Resolve channel
                </ActionButton>
              )}
              {actions.onBuildPreview && !data.pregenSiteUrl && (
                <ActionButton
                  onClick={() => actions.onBuildPreview!(data.id)}
                  busy={actions.building}
                  Icon={Globe}
                  title="Ask WanderOS to build a preview site from their current site"
                >
                  Build preview
                </ActionButton>
              )}
              {actions.onRank && (
                <ActionButton
                  onClick={() => actions.onRank!(data.id)}
                  busy={actions.ranking}
                  Icon={Gauge}
                  title="Score the site with the lead ranker and capture a screenshot"
                >
                  {data.rankOverall == null ? "Rank site" : "Re-rank site"}
                </ActionButton>
              )}
              {actions.onGenerate && (
                <ActionButton
                  onClick={() => actions.onGenerate!(data.id)}
                  busy={actions.generating}
                  Icon={Sparkles}
                >
                  {data.outreach ? "Regenerate sequence" : "Generate sequence"}
                </ActionButton>
              )}
              {actions.onVerify && (
                <ActionButton
                  onClick={() => actions.onVerify!(data.id)}
                  busy={actions.verifying}
                  Icon={ShieldCheck}
                  title="Minerva geo + LinkedIn check on freemail contacts"
                >
                  Verify people
                </ActionButton>
              )}
              <ActionButton
                onClick={() =>
                  ask(
                    data.outreach
                      ? `Review the outreach sequence for ${data.domain} and tell me what you would change before it goes out.`
                      : `Work ${data.domain} for me — check what we know, what is missing, and what the next step should be.`,
                  )
                }
                Icon={MessagesSquare}
                title="Hand this prospect to the assistant"
              >
                Ask about this
              </ActionButton>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4" />
              Sequence
              {data.outreach?.status && (
                <span className="text-muted-foreground text-xs font-normal">
                  {data.outreach.status}
                </span>
              )}
            </div>
            <SequencePreview data={data} />
          </div>
        </div>
      </div>
    </section>
  );
}
