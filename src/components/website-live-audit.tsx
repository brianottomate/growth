"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  SearchCheck,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import {
  WEBSITE_AUDIT_ISSUE_LABELS,
  type WebsiteAuditEntry,
  type WebsiteAuditIssue,
  type WebsiteAuditResult,
} from "@/lib/website-audit";
import { useTRPC } from "@/trpc/react";

const severeIssues = new Set<WebsiteAuditIssue>([
  "fetch_error",
  "missing_title",
  "missing_description",
  "missing_og_title",
  "missing_og_description",
  "missing_og_image",
  "missing_twitter_card",
]);

export function WebsiteLiveAudit({
  brandId,
  brandName,
  ogToolUrl,
}: {
  brandId: string;
  brandName: string;
  ogToolUrl: string | null;
}) {
  const trpc = useTRPC();
  const [result, setResult] = useState<WebsiteAuditResult | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(true);
  const audit = useMutation(
    trpc.website.audit.mutationOptions({
      onSuccess: (next) => {
        setResult(next);
        toast.success(
          `Audited ${next.audited.toLocaleString()} live pages for ${brandName}`,
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const visibleEntries = useMemo(
    () =>
      result?.entries.filter((entry) => !onlyIssues || entry.issues.length) ??
      [],
    [onlyIssues, result],
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, WebsiteAuditEntry[]>();
    for (const entry of visibleEntries) {
      const current = grouped.get(entry.group) ?? [];
      current.push(entry);
      grouped.set(entry.group, current);
    }
    return [...grouped.entries()];
  }, [visibleEntries]);

  return (
    <section className="mt-5 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <SearchCheck className="size-4" />
            <h2 className="text-sm font-semibold">
              Live OG and metadata audit
            </h2>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Fetch every URL in {brandName}&apos;s sitemap without changing the
            stored Website wall.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ogToolUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={ogToolUrl} target="_blank" rel="noopener noreferrer">
                <Wrench className="size-3.5" />
                Open OG generator
                <ExternalLink className="size-3" />
              </a>
            </Button>
          )}
          <Button
            size="sm"
            loading={audit.isPending}
            onClick={() => audit.mutate({ brandId })}
          >
            <RefreshCw className="size-3.5" />
            {result ? "Run again" : "Run live audit"}
          </Button>
        </div>
      </div>

      {!result && (
        <p className="text-muted-foreground mt-4 border-t pt-4 text-xs">
          Unlike Sync sitemap, this checks rolled-up articles and other bulk
          routes individually. The result is a fresh diagnostic, not stored
          content.
        </p>
      )}

      {result && (
        <div className="mt-5 space-y-5 border-t pt-5">
          <AuditSummary result={result} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-muted-foreground text-xs">
              {result.audited.toLocaleString()} of{" "}
              {result.totalDiscovered.toLocaleString()} discovered URLs checked
              {result.truncated ? " · audit capped at 500 URLs" : ""} ·{" "}
              {new Date(result.auditedAt).toLocaleString()}
            </div>
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <Switch
                checked={onlyIssues}
                onCheckedChange={setOnlyIssues}
                aria-label="Show only pages with issues"
              />
              Only pages with issues
            </label>
          </div>

          {groups.length ? (
            <div className="space-y-3">
              {groups.map(([group, entries]) => (
                <details key={group} open className="rounded-lg border">
                  <summary className="hover:bg-muted/40 flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-medium">
                    <span>{group}</span>
                    <span className="text-muted-foreground">
                      {entries.length} page{entries.length === 1 ? "" : "s"}
                    </span>
                  </summary>
                  <div className="divide-y border-t">
                    {entries.map((entry) => (
                      <AuditEntryRow key={entry.path} entry={entry} />
                    ))}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border p-4 text-sm">
              <CheckCircle2 className="size-4 text-emerald-500" />
              No issues in the current filter.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AuditSummary({ result }: { result: WebsiteAuditResult }) {
  const stats = [
    ["Pages", result.audited],
    ["Core complete", result.summary.complete],
    ["With issues", result.summary.withIssues],
    ["Fetch errors", result.summary.fetchErrors],
    ["Missing OG image", result.summary.missingOgImage],
    ["Metadata mismatches", result.summary.metadataMismatches],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map(([label, value]) => (
        <div key={label} className="bg-muted/40 rounded-lg p-3">
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          <div className="text-muted-foreground mt-0.5 text-[10px]">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditEntryRow({ entry }: { entry: WebsiteAuditEntry }) {
  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs font-medium hover:underline"
        >
          {entry.path} <ExternalLink className="inline size-3" />
        </a>
        {entry.complete && entry.issues.length === 0 ? (
          <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-500">
            Complete
          </span>
        ) : (
          entry.issues.map((issue) => (
            <span
              key={issue}
              className={`rounded-full border px-2 py-0.5 text-[10px] ${
                severeIssues.has(issue)
                  ? "border-red-500/30 text-red-500"
                  : "border-amber-500/30 text-amber-500"
              }`}
            >
              {WEBSITE_AUDIT_ISSUE_LABELS[issue]}
            </span>
          ))
        )}
      </div>

      {entry.fetchError ? (
        <p className="text-muted-foreground mt-3 text-xs">{entry.fetchError}</p>
      ) : (
        <div className="mt-3 grid gap-2 text-xs lg:grid-cols-2">
          <MetadataLine
            label="Title"
            value={entry.title}
            compare={entry.ogTitle}
            max={60}
          />
          <MetadataLine
            label="Description"
            value={entry.description}
            compare={entry.ogDescription}
            max={160}
          />
          <MetadataLine
            label="OG title"
            value={entry.ogTitle}
            compare={entry.twitterTitle}
            compareLabel="Twitter"
            max={60}
          />
          <MetadataLine
            label="OG description"
            value={entry.ogDescription}
            compare={entry.twitterDescription}
            compareLabel="Twitter"
            max={160}
          />
        </div>
      )}
    </div>
  );
}

function MetadataLine({
  label,
  value,
  compare,
  compareLabel = "OG",
  max,
}: {
  label: string;
  value: string | null;
  compare: string | null;
  compareLabel?: string;
  max: number;
}) {
  return (
    <div className="bg-muted/30 rounded-md px-3 py-2">
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-[10px] font-medium uppercase">
        <span>{label}</span>
        <span className={(value?.length ?? 0) > max ? "text-red-500" : ""}>
          {value?.length ?? 0}/{max}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 leading-relaxed">{value || "—"}</p>
      {compare && compare !== value && (
        <p className="mt-1 line-clamp-1 text-[10px] text-amber-500">
          {compareLabel}: {compare}
        </p>
      )}
    </div>
  );
}
