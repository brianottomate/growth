"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
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
import { useTRPC } from "@/trpc/react";

function Json({ value }: { value: unknown }) {
  return (
    <pre className="bg-muted/40 mt-2 max-h-[70vh] overflow-auto rounded-lg border p-3 text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function EnrichDrawer({
  domain,
  open,
  onOpenChange,
}: {
  domain: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const enrich = useMutation(trpc.leads.enrich.mutationOptions());
  const hubspot = useMutation(trpc.leads.pullFromHubspot.mutationOptions());
  const merge = useMutation(trpc.leads.proposeMerge.mutationOptions());
  const apply = useMutation(trpc.leads.applyMerge.mutationOptions());

  // Which proposed fields are checked for write. Initialized when a proposal
  // arrives: everything with a non-null proposed value.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (merge.data) {
      setChecked(
        Object.fromEntries(
          merge.data.fields.map((f) => [f.key, f.proposed != null]),
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
                          ours: {f.ours ?? "—"} · hs: {f.hubspot ?? "—"} · web:{" "}
                          {f.web ?? "—"} — {f.reasoning}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

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
                    Write to HubSpot
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
