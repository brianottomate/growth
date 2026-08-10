"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { useTRPC } from "@/trpc/react";

/**
 * What the prospect actually receives, laid out to be shown to a person.
 *
 * `/app/leads/[domain]` renders the same sequence, but organised around a
 * send/no-send decision: scores, contact risk lines, provenance, a live preview
 * probe. That is the right shape for reviewing and the wrong shape for showing
 * someone what we are about to send. This view drops every internal signal and
 * keeps only what lands in the recipient's inbox, plus the before/after the copy
 * is pitching.
 *
 * Read-only on purpose. No generate, no capture, no send. It reads the same
 * `leads.prospect` query as the review page rather than a second endpoint, so
 * the two can never disagree about what the sequence says.
 */

function DayRail({ day }: { day: number }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
        {day === 0 ? "Day 0" : `+${day}d`}
      </span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

export function SequencePresentation({ domain }: { domain: string }) {
  const trpc = useTRPC();
  const prospect = useQuery(trpc.leads.prospect.queryOptions({ domain }));

  if (prospect.isPending) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading {domain}…
      </div>
    );
  }
  if (!prospect.data) {
    return <div className="p-6 text-sm">No lead record for {domain}.</div>;
  }

  const { domain: row, outreach } = prospect.data;
  const enrichment = row.enrichment as {
    leadRank?: { screenshotUrl?: string };
    previewVisual?: {
      theirs?: Array<{ viewport?: string; screenshotUrl?: string }>;
      ours?: Array<{ viewport?: string; screenshotUrl?: string }>;
    };
  } | null;
  const desktop = (shots?: Array<{ viewport?: string; screenshotUrl?: string }>) =>
    shots?.find((shot) => shot.viewport === "desktop")?.screenshotUrl;
  // The ranker's screenshot URL is a presigned Firecrawl link that expires about
  // a week after scoring, so our own rehosted copy wins whenever it exists.
  const theirSite =
    desktop(enrichment?.previewVisual?.theirs) ??
    enrichment?.leadRank?.screenshotUrl;
  const ourPreview = desktop(enrichment?.previewVisual?.ours);
  const steps = outreach?.steps ?? [];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          Outreach sequence
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{row.companyName ?? row.domain}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {row.domain}
          {steps.length ? ` · ${steps.length} touches` : ""}
        </p>
      </header>

      {/* The before and after, which is the whole argument the copy makes. Shown
          above the emails because it is what the reader should have in mind while
          reading them. */}
      {theirSite || ourPreview ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Their site today, and what we built</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <figure className="space-y-2">
              <div className="border-border bg-muted relative aspect-[4/3] w-full overflow-hidden rounded-lg border">
                {theirSite ? (
                  <Image
                    src={theirSite}
                    alt={`${row.domain} today`}
                    fill
                    sizes="(min-width: 640px) 45vw, 90vw"
                    unoptimized
                    className="object-cover object-top"
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
                    No capture of their site
                  </div>
                )}
              </div>
              <figcaption className="text-muted-foreground text-xs">
                Today · {row.domain}
              </figcaption>
            </figure>
            <figure className="space-y-2">
              <div className="border-border bg-muted relative aspect-[4/3] w-full overflow-hidden rounded-lg border">
                {ourPreview ? (
                  <Image
                    src={ourPreview}
                    alt={`Preview built for ${row.domain}`}
                    fill
                    sizes="(min-width: 640px) 45vw, 90vw"
                    unoptimized
                    className="object-cover object-top"
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-xs">
                    No capture yet — take one from the review page
                  </div>
                )}
              </div>
              <figcaption className="text-muted-foreground text-xs">
                Built by Wander · not published
              </figcaption>
            </figure>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold">The emails</h2>
        {!steps.length ? (
          <p className="text-muted-foreground text-sm">
            No sequence drafted for {row.domain} yet.
          </p>
        ) : (
          <div className="space-y-1">
            {steps.map((step, index) => (
              <div key={index}>
                <DayRail day={step.delayDays} />
                <article className="border-border bg-card rounded-lg border p-5">
                  {step.subject ? (
                    <p className="text-base font-semibold">{step.subject}</p>
                  ) : (
                    <p className="text-muted-foreground text-xs italic">
                      Reply in the same thread — no new subject
                    </p>
                  )}
                  <div className="mt-3 text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {step.body}
                  </div>
                </article>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="border-border border-t pt-4">
        <Link
          href={`/app/leads/${encodeURIComponent(row.domain)}`}
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
        >
          Review this prospect
        </Link>
        <span className="text-muted-foreground ml-2 text-xs">
          (scores, contact risk, and where this copy came from)
        </span>
      </footer>
    </div>
  );
}
