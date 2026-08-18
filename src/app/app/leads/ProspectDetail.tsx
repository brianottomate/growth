"use client";

import Image from "next/image";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Gift, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/react";
import { sendAssistantIntent } from "@/lib/assistant-events";
import {
  blastSequenceFor,
  type TemplatePart,
} from "@/lib/pregen-blast-template";
import { osPitchUrl } from "@/lib/pregen-urls";

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
    <div className="flex flex-col gap-0.5 py-1 text-sm sm:flex-row sm:gap-3">
      <span className="text-muted-foreground shrink-0 text-xs sm:w-36 sm:text-sm">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

/** When a touch lands, relative to enrolment. Carried over from the retired
    presentation page: "+3d" reads as a cadence where "day 3" reads as a date. */
function DayRail({ day, label }: { day: number; label: string }) {
  return (
    <div className="flex items-center gap-3 pt-4 pb-1">
      <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
        {day === 0 ? "Day 0" : `+${day}d`}
      </span>
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
    </div>
  );
}

/**
 * Template copy with its variables marked.
 *
 * The mark is always on, in both modes: the question "what varies here" has a
 * different answer from "what does this lead receive", and a reviewer needs
 * both. `filled` only decides what sits inside the mark.
 */
function Merged({ parts, filled }: { parts: TemplatePart[]; filled: boolean }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "text") return <span key={index}>{part.value}</span>;
        if (part.kind === "merge") {
          return (
            <span
              key={index}
              className="rounded bg-sky-500/20 px-1 text-sky-200"
              title={filled ? `merge field: ${part.field}` : part.value}
            >
              {filled ? part.value : `[${part.field}]`}
            </span>
          );
        }
        return (
          <span key={index}>
            <span className="rounded bg-sky-500/20 px-1 text-sky-200 underline underline-offset-2">
              {part.text}
            </span>
            {filled ? (
              <span className="text-muted-foreground block text-xs">
                {part.url}
              </span>
            ) : null}
          </span>
        );
      })}
    </>
  );
}

/** One touch, in the shape the recipient sees it: subject as a heading, or an
    explicit note that it lands as a reply in the same thread. */
function TouchCard({
  arm,
  subjects,
  body,
  tone,
  filled,
}: {
  arm: string;
  /** More than one means the arm A/B tests the subject line. */
  subjects: TemplatePart[][];
  body: TemplatePart[];
  tone: "template" | "bespoke";
  filled: boolean;
}) {
  return (
    <article
      className={
        tone === "template"
          ? "rounded-lg border border-amber-500/25 bg-amber-500/5 p-4"
          : "border-border bg-card rounded-lg border p-4"
      }
    >
      <p
        className={`text-xs font-medium ${
          tone === "template" ? "text-amber-300" : "text-emerald-300"
        }`}
      >
        {arm}
      </p>
      {subjects.length ? (
        subjects.map((subject, index) => (
          <p
            key={index}
            className="mt-1 text-base font-semibold [overflow-wrap:anywhere]"
          >
            {subjects.length > 1 ? (
              <span className="text-muted-foreground text-xs font-normal">
                {String.fromCharCode(65 + index)}{" "}
              </span>
            ) : null}
            <Merged parts={subject} filled={filled} />
          </p>
        ))
      ) : (
        <p className="text-muted-foreground mt-1 text-xs italic">
          Reply in the same thread — no new subject
        </p>
      )}
      <div className="mt-3 text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
        <Merged parts={body} filled={filled} />
      </div>
    </article>
  );
}

/** Header stat: label stacked over value, so narrow columns wrap instead of
    the fixed-width label colliding with its neighbour's value. */
function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm break-words">{children}</p>
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

/**
 * Whose connected inbox the sequence sends from. HubSpot rejects an address it
 * has no mailbox for, and the From line is the whole point of the motion, so
 * this is a deliberate constant rather than the signed-in user.
 */
const SEQUENCE_SENDER_EMAIL = "kristian@wander.com";

const VERDICT_TONE: Record<string, string> = {
  send: "bg-emerald-500/15 text-emerald-300",
  review: "bg-amber-500/15 text-amber-300",
  form: "bg-sky-500/15 text-sky-300",
  skip: "bg-slate-500/15 text-slate-400",
};

export function ProspectDetail({ domain }: { domain: string }) {
  const trpc = useTRPC();
  const [showCrm, setShowCrm] = useState(false);
  // Filled by default: the reviewer's question is almost always "what does this
  // lead receive", and the template reading is one click away.
  const [filled, setFilled] = useState(true);

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
  const capture = useMutation(
    trpc.leads.capturePreview.mutationOptions({ onSuccess: invalidate }),
  );
  const startSequence = useMutation(
    trpc.leads.startPregenSequence.mutationOptions({ onSuccess: invalidate }),
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
    contacts,
    preview,
    outreach,
    cohort,
  } = prospect.data;
  // The other side of the blast-vs-bespoke debate, computed right here so the
  // two sequences this lead could receive sit on one screen. Merges in exactly
  // what a HubSpot template would: the selected contact's first name, the
  // company, and the blast-arm link.
  const selectedContact = contacts.find(
    (contact) => contact.email === channel.bestEmail,
  );
  const blastSteps = blastSequenceFor({
    firstName: selectedContact?.firstName,
    companyName: row.companyName,
    domain: row.domain,
    previewUrl: row.pregenSiteUrl,
  });
  const bespokeSteps = outreach?.steps ?? [];
  const context = outreach?.generationContext ?? null;
  // enrichment.leadRank.screenshotUrl — `siteScreenshotUrl` exists nowhere in
  // this table, so the earlier spelling could never have found one.
  const enrichment = row.enrichment as {
    leadRank?: {
      screenshotUrl?: string;
      overall?: number;
      relationshipSummary?: string;
      reengagementHook?: string;
      concerns?: string[];
      copyNotes?: string;
    };
    previewVisual?: {
      capturedAt?: string;
      theirs?: Array<{ viewport?: string; screenshotUrl?: string }>;
      ours?: Array<{ viewport?: string; screenshotUrl?: string }>;
    };
    correspondence?: {
      computedAt: string;
      emails: {
        available: number;
        inbound: number;
        outbound: number;
        items?: Array<{
          engagementId: string;
          direction: string;
          sentAt: string;
          subject: string;
          excerpt: string;
        }>;
      };
      activity: {
        calls: number;
        meetings: number;
        notes: number;
        items?: Array<{
          engagementId: string;
          kind: string;
          occurredAt: string;
          qualifier: string | null;
          title: string;
          excerpt: string;
        }>;
      };
      lastContactAt: string | null;
    };
  } | null;
  const correspondence = enrichment?.correspondence;
  const rank = enrichment?.leadRank;
  const visual = enrichment?.previewVisual;
  const desktop = (
    shots?: Array<{ viewport?: string; screenshotUrl?: string }>,
  ) => shots?.find((shot) => shot.viewport === "desktop")?.screenshotUrl;
  // Prefer our own rehosted shot of their site. The ranker's URL is a presigned
  // Firecrawl link that expires about a week after scoring, so on any older
  // domain it renders as a broken image.
  const screenshot = desktop(visual?.theirs) ?? rank?.screenshotUrl;
  const previewShot = desktop(visual?.ours);
  const previewShotAt = visual?.capturedAt;
  // Derived, never stored: same label and token, wrapped in the pitch page.
  const wrapperUrl = preview.url ? osPitchUrl(preview.url) : null;

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
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="PMS">{row.pms ?? "—"}</Stat>
          <Stat label="Units">{fmt(row.unitCount ?? row.unitEstimate)}</Stat>
          <Stat label="Owner">{row.hubspotOwner ?? "unassigned"}</Stat>
          <Stat label="Lead status">{row.hubspotLeadStatus ?? "—"}</Stat>
          <Stat label="Fit">{fmt(row.scorePregenPotential)}</Stat>
          <Stat label="Score version">{row.scoreVersion ?? "—"}</Stat>
        </div>

        {/* Addresses and verbs, in the card that names the prospect. Both used
            to sit at the far end of a long page: the links inside the preview
            section and the buttons below the correspondence dump, so acting on
            a lead meant scrolling past everything you had just read. */}
        <div className="border-border mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
          {preview.url ? (
            <a
              href={preview.url}
              target="_blank"
              rel="noreferrer"
              title="Open the pregen preview they will see"
              aria-label="Open the pregen preview"
              className="border-border text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-md border"
            >
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          {wrapperUrl ? (
            <a
              href={wrapperUrl}
              target="_blank"
              rel="noreferrer"
              title="Open the wander.com wrapper, the page this copy sends"
              aria-label="Open the wander.com wrapper"
              className="border-border text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-md border"
            >
              <Gift className="size-3.5" />
            </a>
          ) : null}
          <span className="bg-border mx-1 h-6 w-px" />
          <Button
            size="sm"
            variant="outline"
            disabled={rank_.isPending}
            onClick={() => rank_.mutate({ domain, persist: true })}
          >
            {rank_.isPending ? "Ranking…" : "Rank"}
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
          {/* The preview does not exist for most of the universe, so copy has
              to be workable before it does. Marked, and publishing refuses it. */}
          <Button
            size="sm"
            variant="outline"
            disabled={generate.isPending}
            onClick={() => generate.mutate({ domainId: row.id, pretend: true })}
          >
            Draft against a stand-in
          </Button>
          {/* The only button here that causes mail to leave a mailbox. The
              refusals live server-side so they bind regardless of surface;
              this just surfaces what came back. */}
          <Button
            size="sm"
            disabled={startSequence.isPending || !channel.bestEmail}
            onClick={() => {
              const target = contacts.find(
                (contact) => contact.email === channel.bestEmail,
              );
              if (!target) return;
              startSequence.mutate({
                domainId: row.id,
                contactId: target.id,
                senderEmail: SEQUENCE_SENDER_EMAIL,
                acknowledgeWarnings: false,
              });
            }}
          >
            {startSequence.isPending ? "Enrolling…" : "Start sequence"}
          </Button>
          {/* Hand off to the assistant rather than growing a button per action */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              sendAssistantIntent({
                type: "work_prospect",
                domain: row.domain,
                companyName: row.companyName,
                visibleText: `Work ${row.domain} with me. Preview is ${preview.state} (${preview.detail}), selected channel ${channel.bestEmail ?? "none"}. Tell me what you'd do next and why before doing it.`,
              })
            }
          >
            Work in chat
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Ranking scores the site and writes back. Generating saves a draft. It
          never publishes or enrols.
          {preview.state !== "live"
            ? ` Preview is ${preview.state}, so a real generation will refuse; the stand-in is for iterating on copy.`
            : ""}
        </p>
        {rank_.error ? (
          <p className="mt-2 text-xs text-red-300">{rank_.error.message}</p>
        ) : null}
        {generate.error ? (
          <p className="mt-2 text-xs text-red-300">{generate.error.message}</p>
        ) : null}
        {rank_.data ? (
          <p className="mt-2 text-xs text-emerald-300">
            Ranked. Reload to see the new assessment.
          </p>
        ) : null}
        {startSequence.error ? (
          <p className="mt-2 text-xs text-red-300">
            {startSequence.error.message}
          </p>
        ) : null}
        {startSequence.data ? (
          <p className="mt-2 text-xs text-emerald-300">
            Enrolled {startSequence.data.toEmail} in{" "}
            {startSequence.data.sequenceName}, sending from{" "}
            {startSequence.data.enrolledByEmail}.
          </p>
        ) : null}
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
          </div>
          {/* The picture, so the comparison this grid promises is actually
              visible. Same frame as their site on the left, and the capture is
              shot at the same viewport, so the two are honestly comparable. */}
          {previewShot ? (
            <div className="border-border bg-muted relative mt-3 aspect-[4/3] w-full overflow-hidden rounded border">
              <Image
                src={previewShot}
                alt={`Preview built for ${row.domain}`}
                fill
                sizes="(min-width: 1024px) 40vw, 90vw"
                unoptimized
                className="object-cover object-top"
              />
            </div>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm">
              No capture yet.{" "}
              {preview.url
                ? "Capture one to see it beside their site."
                : "There is no preview assigned to capture."}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!preview.url || capture.isPending}
              onClick={() => capture.mutate({ domain: row.domain })}
            >
              {capture.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {previewShot ? "Recapture" : "Capture preview"}
            </Button>
            {previewShotAt ? (
              <span className="text-muted-foreground text-xs">
                shot {previewShotAt.slice(0, 10)}
              </span>
            ) : null}
          </div>
          {capture.error ? (
            <p className="mt-2 text-xs text-red-300">{capture.error.message}</p>
          ) : null}
          {preview.url ? (
            <div className="text-muted-foreground mt-2 space-y-1 text-xs break-all">
              {wrapperUrl ? (
                <a
                  href={wrapperUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground block"
                >
                  {wrapperUrl}
                </a>
              ) : null}
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground block"
              >
                {preview.url}
              </a>
            </div>
          ) : null}
          {preview.state === "dead" ? (
            <p className="mt-2 text-xs text-red-300">
              Generating copy against this will describe a page nobody can open.
              Most stored previews sit on retired localcan tunnels.
            </p>
          ) : null}
        </Section>
      </div>

      {/* The sequence, right under the previews it pitches. What it was
          written from, then blast-vs-bespoke per touch. */}
      <Section
        title="Sequence"
        note={
          outreach
            ? `${outreach.status} · ${outreach.model ?? "unknown model"}`
            : "No draft yet"
        }
      >
        <div className="space-y-3">
          {outreach ? (
            <>
              {outreach.angle ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">Angle: </span>
                  {outreach.angle}
                  {context?.recipient?.name ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · written to {context.recipient.name}
                    </span>
                  ) : null}
                </p>
              ) : null}

              {/* The model's queue for the rep: facts it wanted and refused to
                invent. Answer one as steer and regenerate. */}
              {(context?.openQuestions?.length ?? 0) > 0 ? (
                <div className="rounded border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-200">
                  <div className="mb-1 font-medium">Questions for the rep</div>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {context!.openQuestions!.map((question, index) => (
                      <li key={index}>{question}</li>
                    ))}
                  </ul>
                </div>
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
                      Stand-in draft — written before a readable preview
                      existed, so it describes no real page. Publishing refuses
                      it. Use it to iterate on copy, then regenerate against the
                      real preview.
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
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  This draft predates provenance capture, so what it was written
                  from was not recorded. Regenerate to capture it.
                </p>
              )}
            </>
          ) : null}

          {/* The internal debate, made lookable touch by touch: the template
              every lead gets and the copy written for this one share a row, so
              the comparison is same-touch against same-touch. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs">
              <span className="font-medium text-amber-300">Template</span>
              <span className="text-muted-foreground">
                {" "}
                is Kyle&apos;s copy, identical for every lead;{" "}
              </span>
              <span className="rounded bg-sky-500/20 px-1 text-sky-200">
                highlighted
              </span>
              <span className="text-muted-foreground">
                {" "}
                spans are the only parts that vary.{" "}
              </span>
              <span className="font-medium text-emerald-300">Bespoke</span>
              <span className="text-muted-foreground">
                {" "}
                is written from this lead&apos;s own record, so all of it does.
              </span>
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFilled((value) => !value)}
            >
              {filled ? "Show merge fields" : "Show filled in"}
            </Button>
          </div>
          {!bespokeSteps.length ? (
            <p className="text-muted-foreground text-sm">
              Nothing generated for this company yet. The template touches below
              are what it would get today.
            </p>
          ) : null}
          {Array.from({
            length: Math.max(blastSteps.length, bespokeSteps.length),
          }).map((_, index) => {
            const blast = blastSteps[index];
            const bespoke = bespokeSteps[index];
            // The two arms can space the same touch differently, so the rail
            // shows the bespoke timing when they disagree and names the gap
            // rather than quietly picking one.
            const days = [blast?.delayDays, bespoke?.delayDays].filter(
              (value): value is number => value != null,
            );
            const rail = bespoke?.delayDays ?? blast?.delayDays ?? 0;
            const drift =
              days.length === 2 && days[0] !== days[1]
                ? `Touch ${index + 1} · template sends day ${blast!.delayDays}`
                : `Touch ${index + 1}`;
            return (
              <div key={index}>
                <DayRail day={rail} label={drift} />
                <div className="grid gap-3 lg:grid-cols-2">
                  {blast ? (
                    <TouchCard
                      arm="Template"
                      subjects={blast.subjects}
                      body={blast.body}
                      tone="template"
                      filled={filled}
                    />
                  ) : (
                    <div className="text-muted-foreground hidden items-center rounded-lg border border-dashed p-4 text-xs lg:flex">
                      The template has no touch {index + 1}.
                    </div>
                  )}
                  {bespoke ? (
                    <TouchCard
                      arm="Bespoke"
                      subjects={
                        bespoke.subject
                          ? [[{ kind: "text", value: bespoke.subject }]]
                          : []
                      }
                      body={[{ kind: "text", value: bespoke.body }]}
                      tone="bespoke"
                      filled={filled}
                    />
                  ) : bespokeSteps.length ? (
                    <div className="text-muted-foreground hidden items-center rounded-lg border border-dashed p-4 text-xs lg:flex">
                      The bespoke draft has no touch {index + 1}.
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

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
          // Scrolls inside its own box on narrow screens; four columns never
          // fit a phone and squeezing them makes every cell unreadable.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
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
          </div>
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

      {/* The stored record renders instantly; the live HubSpot read is a
          refresh, because it 429s under bulk load and rarely says anything the
          last rank or generation did not already capture. */}
      <Section
        title="HubSpot correspondence"
        note={
          correspondence
            ? `Stored ${correspondence.computedAt.slice(0, 10)} · refreshed whenever ranking or generation runs`
            : "Nothing stored yet — rank this prospect, or load live below."
        }
      >
        <div className="space-y-2 text-xs">
          {correspondence ? (
            <>
              <p className="text-muted-foreground">
                {correspondence.emails.outbound} outbound ·{" "}
                {correspondence.emails.inbound} inbound ·{" "}
                {correspondence.activity.calls} calls ·{" "}
                {correspondence.activity.meetings} meetings ·{" "}
                {correspondence.activity.notes} notes
                {correspondence.lastContactAt
                  ? ` · last contact ${correspondence.lastContactAt.slice(0, 10)}`
                  : ""}
              </p>
              {!correspondence.emails.items &&
              !correspondence.activity.items ? (
                <p className="text-muted-foreground">
                  This summary predates message excerpts. Re-rank or regenerate
                  to store them, or load live below.
                </p>
              ) : null}
              {(correspondence.emails.items ?? []).map((item) => (
                <div
                  key={item.engagementId}
                  className="border-border rounded border p-2"
                >
                  <p>
                    <span className="text-foreground">{item.direction}</span> ·{" "}
                    {item.sentAt.slice(0, 10)} · {item.subject}
                  </p>
                  <p className="text-muted-foreground mt-1 [overflow-wrap:anywhere]">
                    {item.excerpt}
                  </p>
                </div>
              ))}
              {(correspondence.activity.items ?? []).map((item) => (
                <div
                  key={item.engagementId}
                  className="border-border rounded border p-2"
                >
                  <p>
                    <span className="text-foreground">{item.title}</span>
                    {item.qualifier ? ` (${item.qualifier})` : ""} ·{" "}
                    {item.occurredAt.slice(0, 10)}
                  </p>
                  <p className="text-muted-foreground mt-1 [overflow-wrap:anywhere]">
                    {item.excerpt}
                  </p>
                </div>
              ))}
            </>
          ) : null}

          {!showCrm ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCrm(true)}
            >
              {correspondence
                ? "Load live from HubSpot"
                : "Load correspondence"}
            </Button>
          ) : crm.isPending ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading HubSpot…
            </div>
          ) : crm.data?.available === false ? (
            <p className="text-muted-foreground text-sm">{crm.data.reason}.</p>
          ) : crm.data?.available ? (
            <div className="space-y-2">
              <p className="text-foreground font-medium">
                Live from HubSpot: {crm.data.emails.retained} of{" "}
                {crm.data.emails.available} emails ·{" "}
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
                  <p className="text-muted-foreground mt-1 [overflow-wrap:anywhere]">
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
                  <p className="text-muted-foreground mt-1 [overflow-wrap:anywhere]">
                    {item.body.slice(0, 400)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Nothing returned.</p>
          )}
        </div>
      </Section>
    </div>
  );
}
