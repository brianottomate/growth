"use client";

import { useEffect, useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { orpc, type RouterOutputs } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ReportView } from "@/app/report/[token]/ReportView";
import {
  performanceReportContent,
  type PerformanceReportContent,
} from "@/lib/performance-report";

type Workspace = RouterOutputs["performance"]["reportWorkspace"];
type Draft = Workspace["reports"][number];
type Review = RouterOutputs["performance"]["reviewReport"];
const blank = (): Draft => ({
  id: "",
  cycleId: null,
  content: {
    periodLabel: "",
    startDate: "",
    endDate: "",
    metrics: { spend: Number.NaN },
    channels: [{ platform: "meta_ads", status: "planned" }],
    sources: [],
    otherBookings: [],
    highlights: [],
    deliverables: [],
    narrative: null,
    recommendations: null,
    caseStudy: null,
  },
});

type Field<T> = {
  key: keyof T;
  label: string;
  kind?: "number" | "date" | "lines";
  options?: readonly string[];
};
function Fields<T extends object>({
  value,
  fields,
  onChange,
}: {
  value: T;
  fields: Field<NoInfer<T>>[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
      {fields.map((field) => {
        const current = value[field.key];
        const text = Array.isArray(current)
          ? current.join("\n")
          : typeof current === "number" && !Number.isFinite(current)
            ? ""
            : String(current ?? "");
        const update = (next: string) =>
          onChange({
            ...value,
            [field.key]:
              field.kind === "number"
                ? next === ""
                  ? undefined
                  : Number(next)
                : field.kind === "lines"
                  ? next.split("\n")
                  : next || undefined,
          });
        const fieldId = `${id}-${String(field.key)}`;
        return (
          <div key={String(field.key)} className="space-y-1.5">
            <Label htmlFor={fieldId}>{field.label}</Label>
            {field.options ? (
              <Select value={text} onValueChange={update}>
                <SelectTrigger id={fieldId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.kind === "lines" ? (
              <Textarea
                id={fieldId}
                value={text}
                onChange={(event) => update(event.target.value)}
              />
            ) : (
              <Input
                id={fieldId}
                type={
                  field.kind === "number"
                    ? "number"
                    : field.kind === "date"
                      ? "date"
                      : "text"
                }
                min={field.kind === "number" ? 0 : undefined}
                step="any"
                value={text}
                onChange={(event) => update(event.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
function Rows<T extends object>({
  title,
  values,
  fields,
  create,
  onChange,
}: {
  title: string;
  values: T[];
  fields: Field<NoInfer<T>>[];
  create: () => NoInfer<T>;
  onChange: (values: T[]) => void;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-medium">{title}</h3>
      {values.map((value, index) => (
        <div key={index} className="space-y-3 rounded-lg border p-4">
          <Fields
            value={value}
            fields={fields}
            onChange={(next) =>
              onChange(values.map((row, i) => (i === index ? next : row)))
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            Remove {title.toLowerCase()} row {index + 1}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...values, create()])}
      >
        Add {title.toLowerCase()}
      </Button>
    </section>
  );
}

export function ReportsEditor({
  brandId,
  brandSlug,
  initial,
}: {
  brandId: string;
  brandSlug: string;
  initial: Workspace;
}) {
  const [workspace, setWorkspace] = useState(initial);
  const [draft, setDraft] = useState<Draft>(
    () => initial.reports[0] ?? blank(),
  );
  const [saved, setSaved] = useState(() => JSON.stringify(draft));
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const dirty = JSON.stringify(draft) !== saved;
  const save = useMutation(orpc.performance.saveReportDraft.mutationOptions());
  const inspect = useMutation(orpc.performance.reviewReport.mutationOptions());
  const publish = useMutation(orpc.performance.publishReport.mutationOptions());
  const revoke = useMutation(
    orpc.performance.revokeReportShare.mutationOptions(),
  );
  const busy =
    save.isPending ||
    inspect.isPending ||
    publish.isPending ||
    revoke.isPending;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(content: PerformanceReportContent) {
    setDraft({ ...draft, content });
    setReview(null);
  }
  function choose(next: Draft) {
    if (dirty && !window.confirm("Discard the unsaved report edits?")) return;
    setDraft(next);
    setSaved(JSON.stringify(next));
    setReview(null);
    setError(null);
  }
  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The report could not be updated.",
      );
    }
  }
  async function saveDraft() {
    const content = performanceReportContent.parse(draft.content);
    const next = await save.mutateAsync({
      brandId,
      id: draft.id || undefined,
      cycleId: draft.cycleId,
      content,
    });
    setDraft(next);
    setSaved(JSON.stringify(next));
    setReview(null);
    setWorkspace((previous) => ({
      ...previous,
      reports: [next, ...previous.reports.filter((row) => row.id !== next.id)],
    }));
  }
  const content = draft.content;
  const shares = workspace.shares.filter(
    (share) => share.reportId === draft.id,
  );
  return (
    <div className="@container space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Client reports</h2>
          <p className="text-sm text-muted-foreground">
            Save your figures and sources, then review the client’s copy before
            publishing a link.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => choose(blank())}
        >
          New report
        </Button>
      </div>
      {workspace.reports.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="report-choice">Saved reports</Label>
          <Select
            value={draft.id || "new"}
            onValueChange={(id) => {
              const next = workspace.reports.find((row) => row.id === id);
              if (next) choose(next);
            }}
            disabled={busy}
          >
            <SelectTrigger id="report-choice">
              <SelectValue placeholder="Choose a report" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New report</SelectItem>
              {workspace.reports.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.content.periodLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-3 text-destructive"
        >
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="space-y-6">
        <Fields
          value={content}
          fields={[
            { key: "periodLabel", label: "Report title" },
            { key: "startDate", label: "Start date", kind: "date" },
            { key: "endDate", label: "End date", kind: "date" },
          ]}
          onChange={edit}
        />
        <div className="space-y-2">
          <Label htmlFor="report-cycle">Billing cycle (optional)</Label>
          <Select
            value={draft.cycleId ?? "none"}
            onValueChange={(value) => {
              setDraft({ ...draft, cycleId: value === "none" ? null : value });
              setReview(null);
            }}
          >
            <SelectTrigger id="report-cycle">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No billing cycle</SelectItem>
              {workspace.cycles.map((cycle) => (
                <SelectItem key={cycle.id} value={cycle.id}>
                  {cycle.period}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <section className="space-y-3">
          <h3 className="font-medium">Results · USD</h3>
          <p className="text-sm text-muted-foreground">
            Leave unavailable counts blank. Enter zero only when the source
            confirms zero.
          </p>
          <Fields
            value={content.metrics}
            fields={[
              { key: "spend", label: "Ad spend (required)", kind: "number" },
              {
                key: "purchaseValue",
                label: "Attributed booking value",
                kind: "number",
              },
              { key: "bookings", label: "Attributed bookings", kind: "number" },
              { key: "impressions", label: "Impressions", kind: "number" },
              { key: "reach", label: "Reach", kind: "number" },
              { key: "linkClicks", label: "Link clicks", kind: "number" },
              {
                key: "sitePageViews",
                label: "Site page views",
                kind: "number",
              },
              { key: "addToCart", label: "Add to cart", kind: "number" },
            ]}
            onChange={(metrics) => edit({ ...content, metrics })}
          />
        </section>
        <Rows<PerformanceReportContent["channels"][number]>
          title="Channels"
          values={content.channels}
          fields={[
            {
              key: "platform",
              label: "Platform",
              options: ["meta_ads", "google_ads"],
            },
            {
              key: "status",
              label: "Status",
              options: ["live", "paused", "setting_up", "planned"],
            },
            { key: "summary", label: "Summary" },
            { key: "details", label: "Details (one per line)", kind: "lines" },
          ]}
          create={() => ({ platform: "meta_ads", status: "planned" })}
          onChange={(channels) => edit({ ...content, channels })}
        />
        <Rows<PerformanceReportContent["sources"][number]>
          title="Sources"
          values={content.sources}
          fields={[
            { key: "label", label: "Source name" },
            {
              key: "via",
              label: "Collected through",
              options: [
                "manual",
                "growth",
                "warehouse",
                "meta_api",
                "meta_cli",
              ],
            },
            {
              key: "fetchedAt",
              label: "Collected at (UTC, e.g. 2026-10-18T10:00:00Z)",
            },
            { key: "attribution", label: "Attribution window" },
            { key: "conversion", label: "Conversion definition" },
            {
              key: "covers",
              label: "Metrics supplied (one per line)",
              kind: "lines",
            },
            { key: "note", label: "Source note" },
          ]}
          create={() => ({
            label: "",
            via: "manual",
            fetchedAt: new Date().toISOString(),
          })}
          onChange={(sources) => edit({ ...content, sources })}
        />
        <Rows<PerformanceReportContent["highlights"][number]>
          title="Ad highlights"
          values={content.highlights}
          fields={[
            { key: "title", label: "Title" },
            { key: "format", label: "Ad format" },
            { key: "headline", label: "Headline" },
            { key: "imageUrl", label: "Stable image URL (HTTPS)" },
            { key: "providerAdId", label: "Provider ad ID" },
            { key: "platformAdId", label: "Growth ad ID" },
            { key: "spend", label: "Spend (USD)", kind: "number" },
            { key: "impressions", label: "Impressions", kind: "number" },
            { key: "linkClicks", label: "Link clicks", kind: "number" },
            { key: "bookings", label: "Bookings", kind: "number" },
            { key: "note", label: "Commentary" },
          ]}
          create={() => ({
            title: "",
            format: "",
            spend: Number.NaN,
            impressions: Number.NaN,
            linkClicks: Number.NaN,
          })}
          onChange={(highlights) => edit({ ...content, highlights })}
        />
        <Rows<PerformanceReportContent["otherBookings"][number]>
          title="Other bookings"
          values={content.otherBookings}
          fields={[
            { key: "label", label: "Source" },
            { key: "bookings", label: "Bookings", kind: "number" },
            {
              key: "bookingValue",
              label: "Booking value (USD)",
              kind: "number",
            },
            { key: "note", label: "Note" },
          ]}
          create={() => ({
            label: "",
            bookings: Number.NaN,
            bookingValue: Number.NaN,
          })}
          onChange={(otherBookings) => edit({ ...content, otherBookings })}
        />
        <Rows<PerformanceReportContent["deliverables"][number]>
          title="Deliverables"
          values={content.deliverables}
          fields={[
            { key: "name", label: "Deliverable" },
            {
              key: "status",
              label: "Status",
              options: ["planned", "in_progress", "delivered"],
            },
            { key: "update", label: "Update" },
          ]}
          create={() => ({ name: "", status: "planned", update: "" })}
          onChange={(deliverables) => edit({ ...content, deliverables })}
        />
        <div className="space-y-2">
          <Label htmlFor="report-narrative">Commentary</Label>
          <Textarea
            id="report-narrative"
            value={content.narrative ?? ""}
            onChange={(event) =>
              edit({ ...content, narrative: event.target.value || null })
            }
            rows={5}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="report-next">Next steps</Label>
          <Textarea
            id="report-next"
            value={content.recommendations ?? ""}
            onChange={(event) =>
              edit({ ...content, recommendations: event.target.value || null })
            }
            rows={4}
          />
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy} onClick={() => void run(saveDraft)}>
          {save.isPending ? "Saving…" : "Save draft"}
        </Button>
        {draft.id && content.caseStudy ? (
          <Button variant="outline" disabled={dirty} asChild>
            <a href={`/case-study/${brandSlug}/${draft.id}`}>Open case study</a>
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={busy || dirty || !draft.id}
            onClick={() =>
              void run(async () => {
                setReview(
                  await inspect.mutateAsync({ brandId, reportId: draft.id }),
                );
              })
            }
          >
            Review saved report
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          {dirty ? "Unsaved changes" : draft.id ? "Draft saved" : "New report"}
        </span>
      </div>
      {review && (
        <section className="space-y-4 rounded-lg border p-4">
          <h3 className="font-semibold">Review the public copy</h3>
          <ReportView report={{ ...review.snapshot, publishedAt: null }} />
          <div className="space-y-2">
            <Label htmlFor="report-expiry">
              Link expires after (days, 1–90)
            </Label>
            <Input
              id="report-expiry"
              className="max-w-32"
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Anyone with this link can read this copy. Publishing creates a new
            link; earlier links keep their content until revoked or expired.
          </p>
          <Button
            disabled={busy || dirty}
            onClick={() =>
              void run(async () => {
                const shared = await publish.mutateAsync({
                  brandId,
                  reportId: draft.id,
                  fingerprint: review.fingerprint,
                  expiresInDays: days,
                });
                setWorkspace((previous) => ({
                  ...previous,
                  shares: [
                    {
                      ...shared,
                      reportId: draft.id,
                      token: shared.path.split("/").at(-1)!,
                      revokedAt: null,
                      createdAt: new Date().toISOString(),
                    },
                    ...previous.shares,
                  ],
                }));
                setReview(null);
              })
            }
          >
            Publish reviewed copy
          </Button>
        </section>
      )}
      {shares.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold">Published links</h3>
          {shares.map((share) => {
            const active =
              !share.revokedAt &&
              (!share.expiresAt || Date.parse(share.expiresAt) > Date.now());
            return (
              <div
                key={share.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <div className="flex-1 text-sm">
                  <p>
                    Created {new Date(share.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-muted-foreground">
                    {share.revokedAt
                      ? "Revoked"
                      : share.expiresAt
                        ? `Expires ${new Date(share.expiresAt).toLocaleDateString()}`
                        : "Existing link, no expiry"}
                  </p>
                </div>
                {active && (
                  <>
                    <Button variant="outline" asChild>
                      <a href={share.path} target="_blank" rel="noreferrer">
                        Open report
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void run(async () => {
                          await navigator.clipboard.writeText(
                            new URL(share.path, window.location.origin).href,
                          );
                        })
                      }
                    >
                      Copy link
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Revoke this link? Anyone using it will lose access.",
                          )
                        )
                          void run(async () => {
                            await revoke.mutateAsync({
                              brandId,
                              shareId: share.id,
                            });
                            setWorkspace((previous) => ({
                              ...previous,
                              shares: previous.shares.map((row) =>
                                row.id === share.id
                                  ? {
                                      ...row,
                                      revokedAt: new Date().toISOString(),
                                    }
                                  : row,
                              ),
                            }));
                          });
                      }}
                    >
                      Revoke
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
