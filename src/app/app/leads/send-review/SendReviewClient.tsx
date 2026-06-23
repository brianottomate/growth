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
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useTRPC, type RouterOutputs } from "@/trpc/react";

type ReviewRow = RouterOutputs["leads"]["sendReview"]["items"][number];
type Verdict = "send" | "review" | "form" | "skip";
type Route = "instantly" | "form" | "none";

const fmt = (n: number | null | undefined) =>
  n == null ? "-" : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;

const verdictStyles: Record<Verdict, string> = {
  send: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  review: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  form: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  skip: "border-red-500/30 bg-red-500/10 text-red-300",
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

function ScoreBadge({ row }: { row: ReviewRow }) {
  const verdict = row.channelScore.verdict;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${verdictStyles[verdict]}`}
    >
      {verdict === "send" ? (
        <CheckCircle2 className="size-3" />
      ) : verdict === "skip" ? (
        <ShieldAlert className="size-3" />
      ) : (
        <Mail className="size-3" />
      )}
      {verdict} · {row.channelScore.score}
    </span>
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

  return (
    <section className="border-border border-t py-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,1.2fr)]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/app/leads?lead=${encodeURIComponent(row.domain)}`}
                  className="font-semibold hover:underline"
                >
                  {row.domain}
                </Link>
                <a
                  href={`https://${row.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowUpRight className="size-3.5" />
                </a>
                <ScoreBadge row={row} />
              </div>
              <div className="text-muted-foreground mt-0.5 text-xs">
                {row.companyName ?? "Unknown company"}
                {location ? ` · ${location}` : ""}
              </div>
            </div>
            <div className="text-muted-foreground text-right text-xs tabular-nums">
              <div>fit {fmt(row.scorePregenPotential)}</div>
              <div>
                units {fmt(row.unitEstimate)}
                {row.unitConfidence ? ` · ${row.unitConfidence}` : ""}
              </div>
            </div>
          </div>

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

          {row.channelScore.candidates.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Candidate</th>
                    <th className="px-3 py-1 font-medium">Source</th>
                    <th className="px-3 py-1 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {row.channelScore.candidates.slice(0, 4).map((candidate) => (
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
  const generate = useMutation(
    trpc.leads.generateOutreach.mutationOptions({
      onSuccess: invalidate,
    }),
  );
  const verify = useMutation(
    trpc.leads.verifyDomainContacts.mutationOptions({
      onSuccess: invalidate,
    }),
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Send review
            </h1>
            <Link
              href="/app/leads"
              className="text-muted-foreground text-xs hover:underline"
            >
              Leads
            </Link>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Enriched net-new domains with channel confidence and draft sequences.
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
          verifying={
            verify.isPending && verify.variables?.domainId === row.id
          }
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
