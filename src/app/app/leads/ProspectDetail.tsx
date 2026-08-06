"use client";

import Image from "next/image";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/react";
import { sendAssistantIntent } from "@/lib/assistant-events";

/**
 * Everything about one prospect on a single surface, addressed by domain.
 *
 * Built around the review decision rather than the data model. The list card it
 * replaces could not answer the three questions that actually decided whether a
 * draft was sendable, so each has a dedicated section here: does the assigned
 * preview resolve, is any contact really reachable, and what did the generator
 * read when it wrote this copy.
 *
 * Rendered by both /app/leads/[domain] and (eventually) the ?lead= drawer, so
 * the two cannot drift the way /leads and /leads/send-review did.
 */

const fmt = (n: number | null | undefined) => (n == null ? "—" : `${n}`);

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span className="text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border rounded-lg border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note ? (
        <p className="text-muted-foreground mt-0.5 text-xs">{note}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const PREVIEW_TONE: Record<string, string> = {
  live: "bg-emerald-500/15 text-emerald-300",
  dead: "bg-red-500/15 text-red-300",
  blocked: "bg-amber-500/15 text-amber-300",
  none: "bg-slate-500/15 text-slate-300",
};

const VERDICT_TONE: Record<string, string> = {
  send: "bg-emerald-500/15 text-emerald-300",
  review: "bg-amber-500/15 text-amber-300",
  form: "bg-sky-500/15 text-sky-300",
  skip: "bg-slate-500/15 text-slate-400",
};

export function ProspectDetail({ domain }: { domain: string }) {
  const trpc = useTRPC();
  const [showCrm, setShowCrm] = useState(false);

  const queryClient = useQueryClient();
  const prospect = useQuery(trpc.leads.prospect.queryOptions({ domain }));
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.leads.prospect.queryKey({ domain }),
    });

  const rank_ = useMutation(
    trpc.leads.rankDomain.mutationOptions({ onSuccess: invalidate }),
  );
  const generate = useMutation(
    trpc.leads.generatePregenOutreach.mutationOptions({
      onSuccess: invalidate,
    }),
  );

  // Live HubSpot correspondence is a provider read, so it waits to be asked for.
  // The draft's own snapshot below is what the copy was written from.
  const crm = useQuery(
    trpc.leads.crmHistory.queryOptions({ domain }, { enabled: showCrm }),
  );

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

  const {
    domain: row,
    channel,
    channels,
    preview,
    outreach,
    cohort,
  } = prospect.data;
  const context = outreach?.generationContext ?? null;
  // enrichment.leadRank.screenshotUrl — `siteScreenshotUrl` exists nowhere in
  // this table, so the earlier spelling could never have found one.
  const rank = (
    row.enrichment as {
      leadRank?: {
        screenshotUrl?: string;
        overall?: number;
        relationshipSummary?: string;
        reengagementHook?: string;
        concerns?: string[];
        copyNotes?: string;
      };
    } | null
  )?.leadRank;
  const screenshot = rank?.screenshotUrl;

  return (
    <div className="space-y-4">
      {/* Identity + the one thing that overrides everything else */}
      <header className="border-border rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{row.domain}</h1>
          <a
            href={`https://${row.domain}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Open their website"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {row.excludeFromOutreach ? (
            <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
              excluded — {row.excludeReason ?? "no reason recorded"}
            </span>
          ) : null}
          {cohort ? (
            <span className="rounded bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300">
              {cohort}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {[row.companyName, row.city, row.state, row.country]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          <Row label="PMS">{row.pms ?? "—"}</Row>
          <Row label="Units">{fmt(row.unitCount ?? row.unitEstimate)}</Row>
          <Row label="Owner">{row.hubspotOwner ?? "unassigned"}</Row>
          <Row label="Lead status">{row.hubspotLeadStatus ?? "—"}</Row>
          <Row label="Fit">{fmt(row.scorePregenPotential)}</Row>
          <Row label="Score version">{row.scoreVersion ?? "—"}</Row>
        </div>
      </header>

      {/* Their site, then our preview — the comparison the pitch rests on */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Their site" note={`https://${row.domain}`}>
          {screenshot ? (
            <div className="border-border bg-muted relative aspect-[4/3] w-full overflow-hidden rounded border">
              <Image
                src={screenshot}
                alt={`${row.domain} homepage`}
                fill
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="object-cover object-top"
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No screenshot captured. Only ranked domains have one.
            </p>
          )}
        </Section>

        <Section
          title="Our preview"
          note="Checked live. A preview that does not resolve cannot be described in copy."
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs ${PREVIEW_TONE[preview.state]}`}
            >
              {preview.state} · {preview.detail}
            </span>
            {preview.url ? (
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline underline-offset-2"
              >
                open
              </a>
            ) : null}
          </div>
          {preview.url ? (
            <p className="text-muted-foreground mt-2 text-xs break-all">
              {preview.url}
            </p>
          ) : null}
          {preview.state === "dead" ? (
            <p className="mt-2 text-xs text-red-300">
              Generating copy against this will describe a page nobody can open.
              Most stored previews sit on retired localcan tunnels.
            </p>
          ) : null}
        </Section>
      </div>

      {/* The ranker's own read. Internal only — the copy policy forbids telling a
          prospect anything about their site's quality or alluding to a score. */}
      {rank ? (
        <Section
          title="Ranker assessment"
          note={`${rank.overall != null ? `overall ${rank.overall} · ` : ""}internal only — never quoted to the prospect`}
        >
          <div className="space-y-2 text-sm">
            {rank.relationshipSummary ? (
              <Row label="Relationship">{rank.relationshipSummary}</Row>
            ) : null}
            {rank.reengagementHook ? (
              <Row label="Hook">{rank.reengagementHook}</Row>
            ) : null}
            {rank.copyNotes ? (
              <Row label="Copy notes">{rank.copyNotes}</Row>
            ) : null}
            {rank.concerns?.length ? (
              <Row label="Concerns">
                <ul className="list-disc pl-4">
                  {rank.concerns.map((concern, index) => (
                    <li key={index}>{concern}</li>
                  ))}
                </ul>
              </Row>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* Reachability — with the rejected rows visible, not hidden */}
      <Section
        title="Reachability"
        note={`Selected channel: ${channel.bestEmail ?? "none"} · route ${channel.route} · verdict ${channel.verdict}`}
      >
        {channel.candidates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No contacts stored. Resolve channels to crawl their site.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left text-xs">
                <th className="border-b py-1 pr-3 font-medium">Email</th>
                <th className="border-b px-3 py-1 font-medium">Who</th>
                <th className="border-b px-3 py-1 text-right font-medium">
                  Score
                </th>
                <th className="border-b px-3 py-1 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {channel.candidates.map((candidate) => (
                <tr key={`${candidate.kind}-${candidate.email}`}>
                  <td className="border-b py-1.5 pr-3 font-mono text-xs break-all">
                    {candidate.email}
                    {candidate.email === channel.bestEmail ? (
                      <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                        selected
                      </span>
                    ) : null}
                  </td>
                  <td className="border-b px-3 py-1.5">
                    {[candidate.name, candidate.title]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="border-b px-3 py-1.5 text-right">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${VERDICT_TONE[candidate.verdict]}`}
                    >
                      {candidate.score}
                    </span>
                  </td>
                  <td className="text-muted-foreground border-b px-3 py-1.5 text-xs">
                    {[...candidate.risks, ...candidate.reasons].join("; ") ||
                      "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {channels.length > 0 ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Captured channels:{" "}
            {channels
              .map((c) => `${c.kind}${c.value ? ` (${c.value})` : ""}`)
              .join(", ")}
          </p>
        ) : null}
      </Section>

      {/* The sequence, and what it was actually written from */}
      <Section
        title="Sequence"
        note={
          outreach
            ? `${outreach.status} · ${outreach.model ?? "unknown model"}`
            : "No draft yet"
        }
      >
        {!outreach ? (
          <p className="text-muted-foreground text-sm">
            Nothing generated for this company.
          </p>
        ) : (
          <div className="space-y-3">
            {outreach.angle ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Angle: </span>
                {outreach.angle}
              </p>
            ) : null}

            {context ? (
              <div
                className={`rounded border p-3 text-xs ${
                  context.preview.pretend
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border bg-muted/30"
                }`}
              >
                {context.preview.pretend ? (
                  <p className="mb-1.5 font-medium text-amber-300">
                    Stand-in draft — written before a readable preview existed,
                    so it describes no real page. Publishing refuses it. Use it
                    to iterate on copy, then regenerate against the real
                    preview.
                  </p>
                ) : null}
                <p className="font-medium">What the generator read</p>
                <div className="mt-1.5 space-y-0.5">
                  <div>
                    Preview at generation:{" "}
                    <span
                      className={
                        context.preview.readable
                          ? "text-emerald-300"
                          : "text-red-300"
                      }
                    >
                      {context.preview.readable
                        ? `readable, ${context.preview.characters} chars`
                        : `NOT readable — ${context.preview.detail}`}
                    </span>
                  </div>
                  <div>Their site: {context.website.characters} chars</div>
                  <div>
                    HubSpot emails: {context.emails?.retained ?? 0} of{" "}
                    {context.emails?.available ?? 0} (
                    {context.emails?.inbound ?? 0} inbound)
                  </div>
                  <div>
                    Calls and notes: {context.activity?.retained ?? 0} of{" "}
                    {context.activity?.available ?? 0}
                  </div>
                  {context.steer ? <div>Steer: {context.steer}</div> : null}
                </div>
                {context.activity?.items.length ? (
                  <ul className="mt-2 space-y-1">
                    {context.activity.items.map((item, index) => (
                      <li key={index} className="text-muted-foreground">
                        <span className="text-foreground">{item.title}</span>
                        {item.qualifier ? ` (${item.qualifier})` : ""} ·{" "}
                        {item.at.slice(0, 10)} — {item.excerpt.slice(0, 180)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {context.emails?.items.length ? (
                  <ul className="mt-2 space-y-1">
                    {context.emails.items.map((item, index) => (
                      <li key={index} className="text-muted-foreground">
                        <span className="text-foreground">
                          {item.direction}
                        </span>{" "}
                        · {item.sentAt.slice(0, 10)} · {item.subject} —{" "}
                        {item.excerpt.slice(0, 180)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                This draft predates provenance capture, so what it was written
                from was not recorded. Regenerate to capture it.
              </p>
            )}

            {(outreach.steps ?? []).map((step, index) => (
              <div key={index} className="border-border rounded border p-3">
                <p className="text-muted-foreground text-xs">
                  Touch {index + 1} · day {step.delayDays}
                  {step.subject ? ` · ${step.subject}` : " · in-thread"}
                </p>
                <p className="mt-1.5 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* On demand, because it is a provider read that 429s under load */}
      <Section
        title="Current HubSpot correspondence"
        note="Fetched on request. This is HubSpot now — not what the copy above was written from."
      >
        {!showCrm ? (
          <Button size="sm" variant="outline" onClick={() => setShowCrm(true)}>
            Load correspondence
          </Button>
        ) : crm.isPending ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading HubSpot…
          </div>
        ) : crm.data?.available === false ? (
          <p className="text-muted-foreground text-sm">{crm.data.reason}.</p>
        ) : crm.data?.available ? (
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">
              {crm.data.emails.retained} of {crm.data.emails.available} emails ·{" "}
              {crm.data.activity.retained} of {crm.data.activity.available}{" "}
              calls and notes
            </p>
            {crm.data.emails.items.map((item) => (
              <div
                key={item.engagementId}
                className="border-border rounded border p-2"
              >
                <p>
                  <span className="text-foreground">{item.direction}</span> ·{" "}
                  {item.sentAt.slice(0, 10)} · {item.subject}
                </p>
                <p className="text-muted-foreground mt-1">
                  {item.body.slice(0, 400)}
                </p>
              </div>
            ))}
            {crm.data.activity.items.map((item) => (
              <div
                key={item.engagementId}
                className="border-border rounded border p-2"
              >
                <p>
                  <span className="text-foreground">{item.title}</span>
                  {item.qualifier ? ` (${item.qualifier})` : ""} ·{" "}
                  {item.occurredAt.slice(0, 10)}
                </p>
                <p className="text-muted-foreground mt-1">
                  {item.body.slice(0, 400)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing returned.</p>
        )}
      </Section>

      {/* The two workflows, in one place. Ranking was script-only until now, so
          scoring a prospect and writing its copy lived in different tools. */}
      <Section
        title="Run"
        note="Ranking scores the site and writes back. Generating saves a draft — it never publishes or enrolls."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={rank_.isPending}
            onClick={() => rank_.mutate({ domain, persist: true })}
          >
            {rank_.isPending ? "Ranking…" : "Rank this prospect"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={generate.isPending}
            onClick={() =>
              generate.mutate({ domainId: row.id, pretend: false })
            }
          >
            {generate.isPending ? "Generating…" : "Generate sequence"}
          </Button>
          {/* The preview does not exist for most of the universe, so copy has to
              be workable before it does. Marked, and publishing refuses it. */}
          <Button
            size="sm"
            variant="outline"
            disabled={generate.isPending}
            onClick={() => generate.mutate({ domainId: row.id, pretend: true })}
          >
            Draft against a stand-in
          </Button>
          {preview.state !== "live" && (
            <span className="text-muted-foreground text-xs">
              Preview is {preview.state} — a real generation will refuse; the
              stand-in draft is for iterating on copy.
            </span>
          )}
        </div>
        {rank_.error ? (
          <p className="mt-2 text-xs text-red-300">{rank_.error.message}</p>
        ) : null}
        {generate.error ? (
          <p className="mt-2 text-xs text-red-300">{generate.error.message}</p>
        ) : null}
        {rank_.data ? (
          <p className="mt-2 text-xs text-emerald-300">
            Ranked — reload to see the new assessment.
          </p>
        ) : null}
      </Section>

      {/* Hand off to the assistant rather than growing a button per action */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            sendAssistantIntent({
              type: "work_prospect",
              domain: row.domain,
              companyName: row.companyName,
              visibleText: `Work ${row.domain} with me. Preview is ${preview.state} (${preview.detail}), selected channel ${channel.bestEmail ?? "none"}. Tell me what you'd do next and why before doing it.`,
            })
          }
        >
          Work this prospect in chat
        </Button>
      </div>
    </div>
  );
}
