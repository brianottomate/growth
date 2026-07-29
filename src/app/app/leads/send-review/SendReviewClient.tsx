"use client";

import Link from "next/link";
import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { useTRPC, type RouterOutputs } from "@/trpc/react";

type ReviewRow = RouterOutputs["leads"]["sendReview"]["items"][number];
type Channel = ReviewRow["channels"][number];
type Verdict = "send" | "review" | "form" | "skip";
type Route = "instantly" | "form" | "none";

// Captured reachability channels — what `channel-discovery.service` found on the
// company's own website. In PR1 these are read-only badges; the gated send
// actions hang off them in PR3.
const channelMeta: Record<string, { Icon: LucideIcon; label: string }> = {
  email: { Icon: Mail, label: "email" },
  phone: { Icon: Phone, label: "phone" },
  form: { Icon: FileText, label: "form" },
  chatbot: { Icon: MessageCircle, label: "chat" },
  sms: { Icon: MessageCircle, label: "sms" },
};

function ChannelBadges({ channels }: { channels: Channel[] }) {
  if (!channels.length) {
    return (
      <span className="text-muted-foreground text-xs">
        No channels captured yet
      </span>
    );
  }
  // One badge per kind, with a count when a domain has several of the same kind.
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

const fmt = (n: number | null | undefined) =>
  n == null ? "-" : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;

// Verdict drives the whole row's visual language: a colored left rail, the
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

const verdictTheme: Record<Verdict, VerdictTheme> = {
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
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

function EvidenceList({ row }: { row: ReviewRow }) {
  const evidence = [
    ...row.channelScore.reasons.map((reason) => ({
      kind: "good",
      text: reason,
    })),
    ...row.channelScore.risks.map((risk) => ({ kind: "risk", text: risk })),
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

function SequencePreview({ row }: { row: ReviewRow }) {
  const outreach = row.outreach;
  if (!outreach?.steps?.length) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
        No sequence draft yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs">
        <span className="text-muted-foreground">Angle:</span>{" "}
        {outreach.angle ?? "-"}
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {outreach.steps.slice(0, 4).map((step, index) => (
          <div key={index} className="rounded-md border p-2">
            <div className="text-muted-foreground text-[10px] font-medium">
              Step {index + 1}
              {step.subject ? ` · ${step.subject}` : " · in-thread"}
            </div>
            <pre className="mt-1 line-clamp-5 font-sans text-xs leading-relaxed whitespace-pre-wrap">
              {step.body}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewRowItem({
  row,
  onResolve,
  onGenerate,
  onVerify,
  resolving,
  generating,
  verifying,
}: {
  row: ReviewRow;
  onResolve: (domainId: string) => void;
  onGenerate: (domainId: string) => void;
  onVerify: (domainId: string) => void;
  resolving: boolean;
  generating: boolean;
  verifying: boolean;
}) {
  const bestEmail = row.channelScore.bestEmail;
  const location = [row.city, row.state, row.country]
    .filter(Boolean)
    .join(", ");

  const theme = verdictTheme[row.channelScore.verdict];

  return (
    <section className="bg-card mb-3.5 flex overflow-hidden rounded-xl border">
      <span className={`w-1 shrink-0 ${theme.rail}`} aria-hidden />
      <div className="min-w-0 flex-1 space-y-5 p-5">
        {/* decision header — the verdict is the hero */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div className="flex min-w-0 gap-3.5">
            <div
              className={`grid size-11 shrink-0 place-items-center rounded-full border-2 ${theme.border}`}
            >
              <span className="text-foreground text-base font-medium tabular-nums">
                {row.channelScore.score}
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
                  {row.channelScore.verdict}
                </span>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                <Link
                  href={`/app/leads?lead=${encodeURIComponent(row.domain)}`}
                  className="truncate font-medium hover:underline"
                >
                  {row.domain}
                </Link>
                <a
                  href={`https://${row.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <ArrowUpRight className="size-3.5" />
                </a>
                <span className="text-muted-foreground truncate text-xs">
                  · {row.companyName ?? "Unknown company"}
                  {location ? ` · ${location}` : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
            <div>fit {fmt(row.scorePregenPotential)}</div>
            <div>
              units {fmt(row.unitEstimate)}
              {row.unitConfidence ? ` · ${row.unitConfidence}` : ""}
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
                  ) : row.channelScore.route === "form" ? (
                    <span className="font-medium">Contact form</span>
                  ) : (
                    <span className="text-muted-foreground">Not resolved</span>
                  )}
                </div>
                <div className="text-muted-foreground mt-0.5 text-[11px]">
                  {row.channelScore.route} · {row.contactCount} stored contacts
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-[11px] font-medium">
                  Evidence
                </div>
                <div className="mt-1">
                  <EvidenceList row={row} />
                </div>
              </div>
            </div>

            <div>
              <div className="text-muted-foreground text-[11px] font-medium">
                Reachability
              </div>
              <div className="mt-1">
                <ChannelBadges channels={row.channels} />
              </div>
            </div>

            {row.channelScore.candidates.length > 0 && (
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
                    {row.channelScore.candidates
                      .slice(0, 4)
                      .map((candidate) => (
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
              <button
                onClick={() => onResolve(row.id)}
                disabled={resolving}
                className="border-border inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {resolving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Resolve channel
              </button>
              <button
                onClick={() => onGenerate(row.id)}
                disabled={generating}
                className="border-border inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {row.outreach ? "Regenerate sequence" : "Generate sequence"}
              </button>
              <button
                onClick={() => onVerify(row.id)}
                disabled={verifying}
                title="Minerva geo + LinkedIn check on freemail contacts"
                className="border-border inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {verifying ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="size-3.5" />
                )}
                Verify people
              </button>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4" />
              Sequence
              {row.outreach?.status && (
                <span className="text-muted-foreground text-xs font-normal">
                  {row.outreach.status}
                </span>
              )}
            </div>
            <SequencePreview row={row} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function SendReviewClient() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState<Verdict | undefined>();
  const [route, setRoute] = useState<Route | undefined>();

  const queryInput = {
    q: q || undefined,
    verdict,
    route,
    limit: 50,
  };
  const reviewOptions = trpc.leads.sendReview.queryOptions(queryInput, {
    placeholderData: keepPreviousData,
  });
  const review = useQuery(reviewOptions);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: reviewOptions.queryKey });
  };

  const resolve = useMutation(
    trpc.leads.resolveChannel.mutationOptions({
      onSuccess: invalidate,
    }),
  );
  // The pregen motion is the only generator now; the Instantly-era
  // generateOutreach is gone. Motion is derived from cohort server-side.
  const generate = useMutation(
    trpc.leads.generatePregenOutreach.mutationOptions({
      onSuccess: invalidate,
    }),
  );
  const verify = useMutation(
    trpc.leads.verifyDomainContacts.mutationOptions({
      onSuccess: invalidate,
    }),
  );

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-3xl font-medium tracking-tight">Send review</h1>
            <Link
              href="/app/leads"
              className="text-muted-foreground text-xs hover:underline"
            >
              Leads
            </Link>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            Enriched net-new domains with channel confidence and draft
            sequences.
          </p>
        </div>
        <div className="text-muted-foreground text-right text-xs">
          {review.data ? `${review.data.items.length} rows loaded` : "Loading"}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-b pb-4">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search domain or company"
            className="border-border bg-background focus:ring-ring w-72 rounded-md border py-1.5 pr-3 pl-8 text-sm focus:ring-1 focus:outline-none"
          />
        </div>
        <span className="bg-border mx-1 h-4 w-px" />
        <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          Verdict
        </span>
        {(["send", "review", "form", "skip"] as Verdict[]).map((value) => (
          <Pill
            key={`verdict-${value}`}
            active={verdict === value}
            onClick={() => setVerdict(verdict === value ? undefined : value)}
          >
            {value}
          </Pill>
        ))}
        <span className="bg-border mx-1 h-4 w-px" />
        <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          Channel
        </span>
        {(["instantly", "form", "none"] as Route[]).map((value) => (
          <Pill
            key={`route-${value}`}
            active={route === value}
            onClick={() => setRoute(route === value ? undefined : value)}
          >
            {value}
          </Pill>
        ))}
      </div>

      {review.isLoading && (
        <div className="text-muted-foreground py-12 text-sm">
          Loading queue...
        </div>
      )}

      {review.data?.items.map((row) => (
        <ReviewRowItem
          key={row.id}
          row={row}
          resolving={
            resolve.isPending && resolve.variables?.domainId === row.id
          }
          generating={
            generate.isPending && generate.variables?.domainId === row.id
          }
          verifying={verify.isPending && verify.variables?.domainId === row.id}
          onResolve={(domainId) => resolve.mutate({ domainId })}
          onGenerate={(domainId) => generate.mutate({ domainId })}
          onVerify={(domainId) => verify.mutate({ domainId })}
        />
      ))}

      {review.data && review.data.items.length === 0 && (
        <div className="text-muted-foreground py-12 text-center text-sm">
          No rows match these filters.
        </div>
      )}
    </div>
  );
}
