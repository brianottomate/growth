"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Check,
  Copy,
  ExternalLink,
  GitMerge,
  Loader2,
  Minus,
  Sparkles,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

/** A row from the leads list — what the table passes into the drawer. */
export type LeadRow = RouterOutputs["leads"]["listDomains"]["items"][number];

/** The AI-generated personalized sequence draft. */
type OutreachDraftView = RouterOutputs["leads"]["generateOutreach"];

// Decision-maker pick heuristic — mirrors the send-list builder's titleScore so
// the drawer's "would send" stars match who'd actually get emailed.
const FREEMAIL = /@(gmail|yahoo|hotmail|aol|outlook|msn|icloud)\./i;
const ROLE_EMAIL =
  /^(info|hello|contact|admin|office|support|reservations|bookings|stay|frontdesk|sales)@/i;
function contactScore(c: {
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  email: string;
}): number {
  let s = 0;
  const t = c.jobTitle ?? "";
  if (/owner|founder|ceo|president|principal|partner/i.test(t)) s += 30;
  else if (/director|vp|vice|general manager|\bgm\b|coo|cmo|head/i.test(t)) s += 20;
  else if (t) s += 10;
  if (c.firstName ?? c.lastName) s += 5;
  if (!FREEMAIL.test(c.email)) s += 15;
  if (ROLE_EMAIL.test(c.email)) s -= 25;
  return s;
}

/**
 * "We THINK it's in HubSpot" marker — reflects our ingested `in_hubspot` flag,
 * NOT a live check. The flag is from a CSV snapshot and is ~30% stale (see the
 * net-new audit), hence the "?" — the live truth comes from "Pull from HubSpot".
 */
export function HsMarker({
  inHubspot,
  leadStatus,
}: {
  inHubspot: boolean;
  leadStatus?: string | null;
}) {
  return inHubspot ? (
    <span
      title={`We think this is already in HubSpot${leadStatus ? ` (${leadStatus})` : ""} — from the CSV snapshot, may be stale. Verify with "Pull from HubSpot".`}
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-300"
    >
      ● in HubSpot?
    </span>
  ) : (
    <span
      title="Not in our CRM snapshot — likely net-new. Verify with 'Pull from HubSpot'."
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300"
    >
      ○ net-new?
    </span>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="bg-muted/40 mt-2 max-h-[70vh] overflow-auto rounded-lg border p-3 text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function EnrichDrawer({
  lead,
  open,
  onOpenChange,
}: {
  lead: LeadRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const domain = lead?.domain ?? null;
  const enrich = useMutation(trpc.leads.enrich.mutationOptions());
  const hubspot = useMutation(trpc.leads.pullFromHubspot.mutationOptions());
  const merge = useMutation(trpc.leads.proposeMerge.mutationOptions());
  const apply = useMutation(trpc.leads.applyMerge.mutationOptions());
  const outreach = useMutation(trpc.leads.generateOutreach.mutationOptions());
  const queue = useMutation(trpc.leads.queueOutreach.mutationOptions());
  const launch = useMutation(trpc.leads.launchOutreachCampaign.mutationOptions());

  // Our own contacts for this domain (the people we'd actually email), ranked.
  const detail = useQuery(
    trpc.leads.getDomain.queryOptions(
      { id: lead?.id ?? "" },
      { enabled: open && !!lead?.id },
    ),
  );
  const rankedContacts = [...(detail.data?.contacts ?? [])].sort(
    (a, b) => contactScore(b) - contactScore(a),
  );

  // The personalized sequence — freshly generated this session, or a stored
  // draft from a previous run (enrichment.outreachDraft).
  const outreachDraft: OutreachDraftView | undefined =
    outreach.data ?? detail.data?.outreach ?? undefined;
  const recipientEmail = (
    detail.data?.domain.enrichment as unknown as
      | { contactChannel?: { bestEmail?: string } }
      | null
      | undefined
  )?.contactChannel?.bestEmail;

  // Which proposed fields are checked for write. Initialized when a proposal
  // arrives: everything with a non-null proposed value.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (merge.data) {
      setChecked(
        Object.fromEntries(
          // Don't pre-tick a placeholder pregen URL — it's a template, not a
          // real site; auto-writing it (especially to HubSpot) persists junk.
          merge.data.fields.map((f) => [
            f.key,
            f.proposed != null &&
              !String(f.proposed).includes("PREGEN_URL_PATTERN"),
          ]),
        ),
      );
    }
  }, [merge.data]);

  const run = () => {
    if (domain) enrich.mutate({ domain });
  };
  const pull = () => {
    if (domain) hubspot.mutate({ domain });
  };
  const proposeMerge = () => {
    if (domain)
      merge.mutate({
        domain,
        enrichment: enrich.data?.extraction.structured ?? null,
      });
  };
  const write = (target: "db" | "hubspot") => {
    if (!domain || !merge.data) return;
    const fields = Object.fromEntries(
      merge.data.fields
        .filter((f) => checked[f.key])
        .map((f) => [f.key, f.proposed]),
    );
    apply.mutate({
      domain,
      fields,
      writeToDb: target === "db",
      writeToHubspot: target === "hubspot",
    });
  };

  // ── Copy a single pasteable blob of everything loaded in this drawer, so it
  // can be dropped into a Claude Code chat for analysis. Includes only the
  // sections that have actually been run (HubSpot pull / enrich / merge). ──
  const [copied, setCopied] = useState(false);
  const [steer, setSteer] = useState("");
  const [recipientOverride, setRecipientOverride] = useState("");
  const hasContext = !!(hubspot.data ?? enrich.data ?? merge.data);

  // No HubSpot company for this domain — confirmed by a live pull, or implied by
  // the merge proposal carrying no HubSpot values. Drives the net-new affordances
  // in the merge section (relabel the write button, drop the empty "hs:" tokens).
  const hsCompanyMissing =
    (hubspot.data?.configured === true && !hubspot.data.hubspot) ||
    (!!merge.data && merge.data.fields.every((f) => f.hubspot == null));

  // The drawer is a single reused instance — opening a different row only swaps
  // the `lead` prop, it does NOT remount. Without this, the previous lead's
  // (in-memory) mutation results would linger and show as stale data. Clear them
  // whenever a new lead is opened. Reset only on open (skip the null/close
  // transition) so results don't flicker away mid close-animation.
  useEffect(() => {
    if (!domain) return;
    enrich.reset();
    hubspot.reset();
    merge.reset();
    apply.reset();
    outreach.reset();
    queue.reset();
    launch.reset();
    setChecked({});
    setCopied(false);
    setSteer("");
    setRecipientOverride("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  const buildContext = (): string => {
    const out: string[] = [`# Lead context — ${domain}`, ""];

    const ex = enrich.data?.extraction.structured;
    if (ex) {
      out.push(
        `**Web signals:** pregenFit \`${ex.pregenFit?.score ?? "?"}\` · tier \`${ex.icpTierGuess ?? "?"}\` · confidence \`${ex.confidence ?? "?"}\` · fed by ${enrich.data?.extraction.providersUsed.join(", ") || "—"}`,
        "",
      );
    }

    if (hubspot.data) {
      out.push("## HubSpot comparison");
      if (hubspot.data.configured === false) out.push("_HubSpot not configured._");
      else if (!hubspot.data.hubspot)
        out.push("_No HubSpot company for this domain — net-new._");
      else out.push(`Record: ${hubspot.data.hubspot.url}`);
      out.push("```json", JSON.stringify(hubspot.data, null, 2), "```", "");
    }

    if (enrich.data) {
      out.push(
        "## Web enrichment — extraction (synthesized)",
        "```json",
        JSON.stringify(enrich.data.extraction.structured, null, 2),
        "```",
        "",
        "## Web enrichment — discovery (raw evidence)",
        "```json",
        JSON.stringify(enrich.data.discovery, null, 2),
        "```",
        "",
      );
    }

    if (merge.data) {
      out.push(
        "## Merge proposal",
        "```json",
        JSON.stringify(merge.data, null, 2),
        "```",
        "",
      );
    }

    if (!hasContext)
      out.push(
        '_Nothing run yet — click "Pull from HubSpot", "Run enrichment", and/or "Propose merge" first, then copy._',
      );

    return out.join("\n");
  };

  const copyContext = async () => {
    try {
      await navigator.clipboard.writeText(buildContext());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            Enrich · {domain}
          </SheetTitle>
          <SheetDescription>
            Fans out to Firecrawl + Perplexity + Tavily + Parallel + Exa, then
            synthesizes one structured object. Inspect-only — nothing is written
            to the DB.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {/* What you clicked — basic info from our row, before any enrichment. */}
          {lead && (
            <div className="bg-muted/30 mt-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {lead.companyName ?? lead.domain}
                  </div>
                  <div className="text-muted-foreground text-[11px]">
                    {[lead.city, lead.state, lead.country]
                      .filter(Boolean)
                      .join(", ") || "location unknown"}
                  </div>
                </div>
                <HsMarker
                  inHubspot={lead.inHubspot}
                  leadStatus={lead.hubspotLeadStatus}
                />
              </div>
              <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span>
                  PMS:{" "}
                  <b className="text-foreground">{lead.pms ?? "—"}</b>
                  {lead.isIntegratedPms ? " · integrated" : ""}
                </span>
                <span>
                  Units (stored):{" "}
                  <b className="text-foreground">{lead.unitCount ?? "—"}</b>
                </span>
                <span>
                  Tier:{" "}
                  <b className="text-foreground">
                    {lead.sourceTier ?? lead.computedTier ?? "—"}
                  </b>
                </span>
                {lead.pregenStatus && (
                  <span>
                    Site:{" "}
                    <b className="text-foreground">{lead.pregenStatus}</b>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Our contacts for this domain — who we'd actually email. */}
          {rankedContacts.length > 0 && (
            <div className="mt-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Contacts ({rankedContacts.length})
                </span>
                <span className="text-muted-foreground text-[11px]">
                  ★ = would send (top 3 by title/email)
                </span>
              </div>
              <div className="mt-2 space-y-1.5">
                {rankedContacts.slice(0, 8).map((c, i) => (
                  <div key={c.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      {i < 3 && <span title="picked to send">★</span>}
                      <span className="font-medium">
                        {[c.firstName, c.lastName].filter(Boolean).join(" ") ||
                          "(no name)"}
                      </span>
                      {c.jobTitle && (
                        <span className="text-muted-foreground">· {c.jobTitle}</span>
                      )}
                    </div>
                    <div className="text-muted-foreground truncate">{c.email}</div>
                  </div>
                ))}
              </div>
              {rankedContacts.length > 8 && (
                <div className="text-muted-foreground mt-1.5 text-[11px]">
                  +{rankedContacts.length - 8} more
                </div>
              )}
            </div>
          )}

          {/* ✦ Personalized outreach — bespoke sequence from the enrichment. */}
          <div className="mt-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">✦ Personalized outreach</span>
              <button
                onClick={() =>
                  lead &&
                  outreach.mutate({
                    domainId: lead.id,
                    steer: steer.trim() || undefined,
                  })
                }
                disabled={outreach.isPending || !lead}
                className="border-border inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {outreach.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Generating…
                  </>
                ) : outreachDraft ? (
                  "Regenerate"
                ) : (
                  "Generate sequence"
                )}
              </button>
            </div>

            <textarea
              value={steer}
              onChange={(e) => setSteer(e.target.value)}
              placeholder="Steer the AI (optional) — e.g. “pretend this is a 200-unit luxury PM in Aspen”, or notes about the person"
              rows={2}
              className="border-border bg-background focus:ring-ring mt-2 w-full rounded-md border px-2 py-1.5 text-[11px] focus:ring-1 focus:outline-none"
            />

            {outreach.error && (
              <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {outreach.error.message}
              </div>
            )}

            {!outreachDraft && !outreach.isPending && (
              <p className="text-muted-foreground mt-1 text-[11px]">
                Writes a bespoke 4-touch sequence for this company from its
                enrichment. Draft only — review before sending.
              </p>
            )}

            {outreachDraft && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px]">
                  <span className="text-muted-foreground">Angle:</span>{" "}
                  {outreachDraft.angle}
                </p>
                {(outreachDraft.personalizedOn?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(outreachDraft.personalizedOn ?? []).map((p, i) => (
                      <span
                        key={i}
                        className="bg-muted rounded px-1.5 py-0.5 text-[10px]"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
                {(outreachDraft.steps ?? []).map((s, i) => (
                  <div key={i} className="rounded-md border p-2">
                    <div className="text-muted-foreground text-[10px] font-medium">
                      Step {i + 1} ·{" "}
                      {s.delayDays === 0 ? "day 0" : `day ${s.delayDays}`}
                      {s.subject ? ` · ${s.subject}` : " · (in-thread reply)"}
                    </div>
                    <pre className="mt-1 font-sans text-xs leading-relaxed whitespace-pre-wrap">
                      {s.body}
                    </pre>
                  </div>
                ))}

                <div className="space-y-2 border-t pt-2">
                  <input
                    type="email"
                    value={recipientOverride}
                    onChange={(e) => setRecipientOverride(e.target.value)}
                    placeholder={
                      recipientEmail
                        ? `${recipientEmail} — default; edit to send to yourself / Kyle`
                        : "recipient email (no corporate one found)"
                    }
                    className="border-border bg-background focus:ring-ring w-full rounded-md border px-2 py-1 text-[11px] focus:ring-1 focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        lead &&
                        queue.mutate({
                          domainId: lead.id,
                          recipientEmail: recipientOverride.trim() || undefined,
                        })
                      }
                      disabled={queue.isPending || !lead}
                      className="rounded-md bg-violet-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-50"
                    >
                      {queue.isPending ? "Queuing…" : "Queue to Instantly"}
                    </button>
                    <button
                      onClick={() => launch.mutate()}
                      disabled={launch.isPending}
                      className="rounded-md border border-violet-500/40 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
                    >
                      {launch.isPending ? "Launching…" : "Launch campaign"}
                    </button>
                  </div>
                  <p className="text-muted-foreground text-[10px]">
                    Queue adds this lead to the shared “WanderOS Personalized”
                    draft campaign at the address above. Launch activates that
                    campaign → everyone currently queued starts sending.
                  </p>
                  {(queue.error ?? launch.error) && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
                      {queue.error?.message ?? launch.error?.message}
                    </div>
                  )}
                  {queue.data && (
                    <div className="text-[11px] text-emerald-400">
                      Queued → {queue.data.recipient}
                    </div>
                  )}
                  {launch.data && (
                    <div className="text-[11px] text-emerald-400">
                      Campaign launched — queued leads send shortly.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Copy everything loaded here as one markdown blob for analysis. */}
          <div className="mt-2 flex justify-end">
            <button
              onClick={copyContext}
              disabled={!hasContext}
              title={
                hasContext
                  ? "Copy HubSpot + enrichment + merge as markdown"
                  : "Run a pull/enrichment first"
              }
              className="border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-40"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Copy className="size-3.5" /> Copy context
                </>
              )}
            </button>
          </div>

          {/* ── HubSpot: live pull + diff against our row (read-only) ── */}
          <div className="mt-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Compare with HubSpot</span>
              <div className="flex items-center gap-2">
                {hubspot.data?.hubspot?.url && (
                  <a
                    href={hubspot.data.hubspot.url}
                    target="_blank"
                    rel="noreferrer"
                    className="border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
                  >
                    Open in HubSpot
                    <ExternalLink className="size-3" />
                  </a>
                )}
                <button
                  onClick={pull}
                  disabled={hubspot.isPending || !domain}
                  className="border-border inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {hubspot.isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Pulling…
                    </>
                  ) : hubspot.data ? (
                    "Re-pull"
                  ) : (
                    "Pull from HubSpot"
                  )}
                </button>
              </div>
            </div>

            {hubspot.error && (
              <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {hubspot.error.message}
              </div>
            )}

            {hubspot.data?.configured === false && (
              <p className="text-muted-foreground mt-2 text-xs">
                HubSpot isn&apos;t configured yet — set{" "}
                <code>HUBSPOT_ACCESS_TOKEN_OPERATED</code> to enable live pulls.
              </p>
            )}

            {hubspot.data?.configured === true && !hubspot.data.hubspot && (
              <p className="text-muted-foreground mt-2 text-xs">
                No HubSpot company found for this domain — it&apos;d be net-new.
              </p>
            )}

            {hubspot.data?.hubspot && (
              <>
                <table className="mt-3 w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="py-1 pr-2 font-medium">Field</th>
                      <th className="px-2 py-1 font-medium">Ours</th>
                      <th className="px-2 py-1 font-medium">HubSpot</th>
                      <th className="py-1 pl-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {hubspot.data.diff.map((d) => (
                      <tr key={d.field} className="border-t">
                        <td className="text-muted-foreground py-1 pr-2 capitalize">
                          {d.field}
                        </td>
                        <td className="px-2 py-1">{d.ours ?? "—"}</td>
                        <td className="px-2 py-1">{d.hubspot ?? "—"}</td>
                        <td className="py-1 pl-2">
                          {d.same ? (
                            <Check className="size-3.5 text-emerald-400" />
                          ) : (
                            <Minus className="size-3.5 text-amber-400" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {hubspot.data.hubspot.contacts.length > 0 && (
                  <div className="text-muted-foreground mt-3 text-[11px]">
                    {hubspot.data.hubspot.contacts.length} HubSpot contact
                    {hubspot.data.hubspot.contacts.length === 1 ? "" : "s"}:{" "}
                    {hubspot.data.hubspot.contacts
                      .map((c) => c.values.email ?? c.values.firstname ?? "?")
                      .slice(0, 5)
                      .join(", ")}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Web enrichment (discovery → AI extraction) ── */}
          <button
            onClick={run}
            disabled={enrich.isPending || !domain}
            className="bg-foreground text-background mt-2 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {enrich.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Enriching… (~10-30s)
              </>
            ) : enrich.data ? (
              "Re-run enrichment"
            ) : (
              "Run enrichment"
            )}
          </button>

          {enrich.error && (
            <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {enrich.error.message}
            </div>
          )}

          {enrich.data && (
            <Tabs defaultValue="extraction" className="mt-4">
              <TabsList>
                <TabsTrigger value="extraction">Extraction</TabsTrigger>
                <TabsTrigger value="discovery">
                  Discovery ({enrich.data.discovery.providers.filter((p) => p.ok).length}/
                  {enrich.data.discovery.providers.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="extraction">
                <div className="text-muted-foreground mt-2 flex flex-wrap gap-3 text-[11px]">
                  <span>
                    pregenFit:{" "}
                    <b className="text-foreground">
                      {enrich.data.extraction.structured.pregenFit.score}
                    </b>
                  </span>
                  <span>
                    tier:{" "}
                    <b className="text-foreground">
                      {enrich.data.extraction.structured.icpTierGuess}
                    </b>
                  </span>
                  <span>
                    confidence:{" "}
                    <b className="text-foreground">
                      {enrich.data.extraction.structured.confidence}
                    </b>
                  </span>
                  <span>
                    fed by: {enrich.data.extraction.providersUsed.join(", ") || "—"}
                  </span>
                </div>
                <Json value={enrich.data.extraction.structured} />
              </TabsContent>

              <TabsContent value="discovery">
                <div className="text-muted-foreground mt-2 flex flex-wrap gap-2 text-[11px]">
                  {enrich.data.discovery.providers.map((p) => (
                    <span
                      key={p.source}
                      className={`rounded px-1.5 py-0.5 font-medium ${
                        p.ok
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {p.source} · {p.ok ? "ok" : "fail"} · {p.ms}ms
                    </span>
                  ))}
                  {enrich.data.discovery.skipped.map((s) => (
                    <span
                      key={s}
                      className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-medium"
                    >
                      {s} · no key
                    </span>
                  ))}
                </div>
                <Json value={enrich.data.discovery} />
              </TabsContent>
            </Tabs>
          )}

          {/* ── Merge: reconcile ours + HubSpot + web, then write back ── */}
          <div className="mt-5 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <GitMerge className="size-4" />
                Merge &amp; write back
              </span>
              <button
                onClick={proposeMerge}
                disabled={merge.isPending || !domain}
                className="border-border inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {merge.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Reconciling…
                  </>
                ) : merge.data ? (
                  "Re-propose"
                ) : (
                  "Propose merge"
                )}
              </button>
            </div>
            <p className="text-muted-foreground mt-1 text-[11px]">
              AI reconciles the three sources. Tick the fields to write, then
              choose a target. HubSpot writes are deliberate — your sales CRM.
            </p>

            {merge.error && (
              <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {merge.error.message}
              </div>
            )}

            {merge.data && (
              <>
                <p className="text-muted-foreground mt-3 text-xs">
                  {merge.data.summary}
                </p>
                {merge.data.conflicts.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {merge.data.conflicts.map((c, i) => (
                      <li key={i} className="flex gap-1.5 text-[11px] text-amber-300">
                        <Minus className="mt-0.5 size-3 shrink-0" />
                        {c}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 space-y-1.5">
                  {merge.data.fields.map((f) => (
                    <label
                      key={f.key}
                      className="hover:bg-accent/30 flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={checked[f.key] ?? false}
                        onChange={(e) =>
                          setChecked((c) => ({ ...c, [f.key]: e.target.checked }))
                        }
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{f.label}:</span>
                          <span className="font-medium">{f.proposed ?? "—"}</span>
                          <span className="text-muted-foreground text-[10px]">
                            {f.source} · {f.confidence}
                          </span>
                        </div>
                        <div className="text-muted-foreground text-[10px]">
                          ours: {f.ours ?? "—"}
                          {f.hubspot != null ? ` · hs: ${f.hubspot}` : ""}
                          {f.web != null ? ` · web: ${f.web}` : ""} —{" "}
                          {f.reasoning}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {hsCompanyMissing && (
                  <p className="mt-3 rounded-md border border-orange-500/20 bg-orange-500/5 p-2 text-[11px] text-orange-300/90">
                    No HubSpot company for this domain — “Create in HubSpot” adds
                    a new record. Only do this for a lead you mean to hand to
                    sales.
                  </p>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => write("db")}
                    disabled={apply.isPending}
                    className="border-border rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    Save to my DB
                  </button>
                  <button
                    onClick={() => write("hubspot")}
                    disabled={apply.isPending}
                    className="rounded-md bg-orange-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-500 disabled:opacity-50"
                  >
                    {hsCompanyMissing ? "Create in HubSpot" : "Write to HubSpot"}
                  </button>
                  {apply.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {apply.data && (
                    <span className="text-xs text-emerald-300">
                      {apply.data.db ? "Saved to DB. " : ""}
                      {apply.data.hubspot !== "skipped"
                        ? `HubSpot ${apply.data.hubspot}.`
                        : ""}
                    </span>
                  )}
                  {apply.error && (
                    <span className="text-xs text-red-300">
                      {apply.error.message}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
