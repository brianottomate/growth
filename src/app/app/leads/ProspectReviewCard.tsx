"use client";

import Link from "next/link";
import { useState } from "react";
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
  MoreHorizontal,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { elapsedLabel, isStuck, type InFlightBuild } from "./PregenBuildsBanner";

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
  /** Durable R2 desktop captures from the before/after service, when taken. */
  captureTheirsUrl?: string | null;
  captureOursUrl?: string | null;
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
  verb: string;
  Icon: LucideIcon;
};

export const verdictTheme: Record<ProspectVerdict, VerdictTheme> = {
  send: {
    rail: "bg-emerald-500",
    border: "border-emerald-500",
    text: "text-emerald-400",
    verb: "Send now",
    Icon: CheckCircle2,
  },
  review: {
    rail: "bg-amber-500",
    border: "border-amber-500",
    text: "text-amber-400",
    verb: "Needs a look",
    Icon: Mail,
  },
  form: {
    rail: "bg-sky-500",
    border: "border-sky-500",
    text: "text-sky-400",
    verb: "Use contact form",
    Icon: FileText,
  },
  skip: {
    rail: "bg-muted-foreground/40",
    border: "border-muted-foreground/50",
    text: "text-muted-foreground",
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

/** The uppercase micro-heading the card's sections share. */
function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
      {children}
    </span>
  );
}

/**
 * The wander.com pitch wrapper is a mechanical transform of the preview URL:
 * https://<label>.<zone>/?t=<token> → https://www.wander.com/os/<label>?t=<token>.
 * Same label, same token — never minted or stored separately.
 */
function osPitchUrl(previewUrl: string): string | null {
  try {
    const parsed = new URL(previewUrl);
    const label = parsed.hostname.split(".")[0];
    const token = parsed.searchParams.get("t");
    if (!label || !token) return null;
    return `https://www.wander.com/os/${label}?t=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

function SequencePreview({ data }: { data: ProspectCardData }) {
  // The 2-up grid clamps bodies to keep eight touches scannable, but approving
  // copy that goes out as a named person means READING it — so the clamp is a
  // scan mode with a one-click exit, not the only view. (An earlier iteration
  // banned the grid outright for this reason; the toggle is the compromise.)
  const [fullCopy, setFullCopy] = useState(false);
  const outreach = data.outreach;
  if (!outreach?.steps.length) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
        No sequence draft yet.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
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
      <div className="text-xs">
        <span className="text-muted-foreground">Angle:</span>{" "}
        {outreach.angle ?? "-"}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {data.pregenSiteUrl && (
          <a
            href={data.pregenSiteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] underline underline-offset-2"
          >
            Open the preview they will see ↗
          </a>
        )}
        {data.pregenSiteUrl && osPitchUrl(data.pregenSiteUrl) && (
          <a
            href={osPitchUrl(data.pregenSiteUrl) ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] underline underline-offset-2"
          >
            wander.com pitch page ↗
          </a>
        )}
        <button
          onClick={() => setFullCopy((v) => !v)}
          className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-2"
        >
          {fullCopy ? "Collapse copy" : "Show full copy"}
        </button>
      </div>
      <div className="grid gap-2.5 @lg:grid-cols-2">
        {outreach.steps.slice(0, 4).map((step, index) => (
          <div key={index} className="rounded-md border p-3">
            <div className="text-muted-foreground flex items-center justify-between gap-2 text-[10px] font-medium">
              <span className="truncate">
                Touch {index + 1}
                {step.subject ? ` · ${step.subject}` : " · in-thread reply"}
              </span>
              <span className="shrink-0 tabular-nums">
                {step.delayDays === 0 ? "day 0" : `day ${step.delayDays}`}
              </span>
            </div>
            {/* A signed preview URL is one long unbroken token, which
                whitespace-pre-wrap alone will happily run past the container —
                anywhere lets it break mid-token. */}
            {/* Two lines by default: enough to recognise the touch's opening
                move, small enough that four touches read as a summary rather
                than a wall. The toggle above is the review mode. */}
            <pre
              className={`mt-1.5 font-sans text-xs leading-relaxed [overflow-wrap:anywhere] break-words whitespace-pre-wrap ${
                fullCopy ? "" : "line-clamp-2"
              }`}
            >
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
  /** WanderOS build currently running for this domain, when one is. */
  build = null,
  /** Link the domain name at something useful for the host surface. */
  href,
}: {
  data: ProspectCardData;
  actions?: ProspectCardActions;
  build?: InFlightBuild | null;
  href?: string;
}) {
  const theme = verdictTheme[data.channel.verdict];
  // The verdict answers ONE question — can we reach this company — and "Send
  // now" over a card with no preview and no sequence read as a lie (nothing
  // sendable exists, and every send path would refuse: generation requires a
  // readable preview, Instantly requires steps, the HubSpot draft requires the
  // preview URL inside touch 1). Compose readiness into the headline: the
  // channel being green means the next step is DRAFTING, and only a card that
  // actually holds copy may claim "Send now". A stand-in draft counts as
  // drafting-still-needed — publishing refuses it anyway.
  const readyToSend =
    data.channel.verdict !== "send" ||
    ((data.outreach?.steps.length ?? 0) > 0 && !data.outreach?.pretend);
  // Drafting is its own pipeline stage, so it gets its own color — violet, the
  // one hue no verdict uses. Sharing emerald with "Send now" made the two
  // states read as one from across the room, and the whole point of the verb
  // split is that they are not.
  // Both drafting stages are violet, but they name different work: no copy at
  // all means "Ready to draft", while a stand-in draft means copy EXISTS and
  // saying "Ready to draft" above four visible touches read as a contradiction
  // — that card's next step is regenerating against the real preview.
  const stageTheme =
    data.channel.verdict === "send" && !readyToSend
      ? {
          ...theme,
          rail: "bg-violet-500",
          border: "border-violet-500",
          text: "text-violet-400",
          verb: data.outreach?.steps.length
            ? "Needs regenerate"
            : "Ready to draft",
          Icon: Sparkles,
        }
      : theme;
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
    // @container: the card lays itself out by ITS OWN width, not the viewport.
    // Viewport breakpoints lied whenever something beside the list (the
    // assistant panel, a drawer) squeezed the container while the window stayed
    // xl — the two-column grids below held on and overlapped into soup.
    <section className="bg-card @container mb-3.5 flex overflow-hidden rounded-xl border">
      <span className={`w-1 shrink-0 ${stageTheme.rail}`} aria-hidden />
      <div className="min-w-0 flex-1 space-y-5 p-5">
        {/* decision header — verdict left, the two everyday actions right, the
            rest folded into an overflow menu so the card stops ending in a
            six-button strip nobody could rank. */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div className="flex min-w-0 gap-3.5">
            <div
              className={`grid size-11 shrink-0 place-items-center rounded-full border-2 ${stageTheme.border}`}
            >
              <span className="text-foreground text-base font-medium tabular-nums">
                {data.channel.score}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-sm font-medium ${stageTheme.text}`}
                >
                  <stageTheme.Icon className="size-3.5" />
                  {stageTheme.verb}
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
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {build ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-300">
                  <Loader2 className="size-3.5 animate-spin" />
                  Building preview · {elapsedLabel(build.requestedAt)}
                  {build.previewUrl && (
                    <a
                      href={build.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Opens the page as it is right now — the gallery fills in last"
                      className="underline underline-offset-2"
                    >
                      peek
                    </a>
                  )}
                  {isStuck(build) && (
                    <span className="text-amber-300">may be stuck</span>
                  )}
                </span>
              ) : (
                actions.onBuildPreview &&
                !data.pregenSiteUrl && (
                  <ActionButton
                    onClick={() => actions.onBuildPreview!(data.id)}
                    busy={actions.building}
                    Icon={Globe}
                    title="Ask WanderOS to build a preview site from their current site"
                  >
                    Build preview
                  </ActionButton>
                )
              )}
              {actions.onResolve && (
                <ActionButton
                  onClick={() => actions.onResolve!(data.id)}
                  busy={actions.resolving}
                  Icon={RefreshCw}
                >
                  Resolve channel
                </ActionButton>
              )}
              {actions.onGenerate && (
                <button
                  onClick={() => actions.onGenerate!(data.id)}
                  disabled={actions.generating}
                  className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {actions.generating ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {data.outreach ? "Regenerate sequence" : "Generate sequence"}
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="More actions"
                    className="border-border inline-flex size-8 items-center justify-center rounded-md border"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {actions.onRank && (
                    <DropdownMenuItem
                      onClick={() => actions.onRank!(data.id)}
                      disabled={actions.ranking}
                    >
                      <Gauge className="size-3.5" />{" "}
                      {data.rankOverall == null ? "Rank site" : "Re-rank site"}
                    </DropdownMenuItem>
                  )}
                  {actions.onVerify && (
                    <DropdownMenuItem
                      onClick={() => actions.onVerify!(data.id)}
                      disabled={actions.verifying}
                    >
                      <ShieldCheck className="size-3.5" /> Verify people
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() =>
                      ask(
                        data.outreach
                          ? `Review the outreach sequence for ${data.domain} and tell me what you would change before it goes out.`
                          : `Work ${data.domain} for me — check what we know, what is missing, and what the next step should be.`,
                      )
                    }
                  >
                    <MessagesSquare className="size-3.5" /> Ask about this
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="text-muted-foreground text-xs tabular-nums">
              fit {fmt(data.fitScore)} · units {fmt(data.unitCount)}
              {data.unitConfidence ? ` · ${data.unitConfidence}` : ""}
            </div>
          </div>
        </div>

        {/* channel + evidence, then the full-width candidate table, then the
            sequence full-width underneath — one reading order at every size,
            instead of the old info/sequence split that made narrow containers
            interleave the two. */}
        <div className="grid gap-x-6 gap-y-1 @lg:grid-cols-2">
          <div>
            <MicroLabel>Selected channel</MicroLabel>
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
            <div className="mt-1.5">
              <ChannelBadges channels={data.channels} />
            </div>
          </div>
          <div>
            <MicroLabel>Evidence</MicroLabel>
            <div className="mt-1.5">
              <EvidenceList data={data} />
            </div>
          </div>
        </div>

        {(data.captureTheirsUrl ?? data.captureOursUrl) && (
          <div className="flex flex-wrap items-end gap-4">
            {data.captureTheirsUrl && (
              <figure>
                <div className="border-border bg-muted h-[72px] w-32 overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size R2 thumb */}
                  <img
                    src={data.captureTheirsUrl}
                    alt={`${data.domain} today`}
                    className="h-full w-full object-cover object-top"
                    loading="lazy"
                  />
                </div>
                <figcaption className="text-muted-foreground mt-1 text-[10px]">
                  Their site
                </figcaption>
              </figure>
            )}
            {data.captureOursUrl && (
              <figure>
                <div className="h-[72px] w-32 overflow-hidden rounded-md border border-emerald-500/40">
                  {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size R2 thumb */}
                  <img
                    src={data.captureOursUrl}
                    alt={`Preview built for ${data.domain}`}
                    className="h-full w-full object-cover object-top"
                    loading="lazy"
                  />
                </div>
                <figcaption className="text-muted-foreground mt-1 text-[10px]">
                  Our preview
                </figcaption>
              </figure>
            )}
          </div>
        )}

        {data.channel.candidates.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="py-1.5 pr-3 text-left">
                    <MicroLabel>Candidate</MicroLabel>
                  </th>
                  <th className="px-3 py-1.5 text-left">
                    <MicroLabel>Source</MicroLabel>
                  </th>
                  <th className="px-3 py-1.5 text-right">
                    <MicroLabel>Score</MicroLabel>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.channel.candidates.slice(0, 4).map((candidate) => {
                  const selected = candidate.email === bestEmail;
                  return (
                    <tr
                      key={`${candidate.kind}-${candidate.email}`}
                      className={selected ? "bg-muted/60" : undefined}
                    >
                      <td className="rounded-l-md border-t py-1.5 pr-3 pl-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{candidate.email}</span>
                          {selected && (
                            <span className="border-border text-muted-foreground rounded-full border px-1.5 py-px text-[10px]">
                              selected
                            </span>
                          )}
                        </div>
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
                      <td className="text-muted-foreground border-t px-3 py-1.5">
                        {candidate.kind}
                      </td>
                      <td className="rounded-r-md border-t px-3 py-1.5 text-right tabular-nums">
                        {candidate.score}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t pt-4">
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
    </section>
  );
}
