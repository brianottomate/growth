"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, Sparkles } from "lucide-react";

import type { WebsitePortfolioAnalysis } from "@/lib/content-analysis";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

export function WebsitePortfolioAnalysisPanel({
  brandId,
  scopeLabel,
  pageCount,
  initialAnalysis,
}: {
  brandId: string | null;
  scopeLabel: string;
  pageCount: number;
  initialAnalysis: WebsitePortfolioAnalysis | null;
}) {
  const router = useRouter();
  const [includeSaved, setIncludeSaved] = useState(false);
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [copied, setCopied] = useState<"recommendations" | "prompt" | null>(
    null,
  );
  const analyze = useMutation(
    orpc.contentAnalysis.analyzeWebsitePortfolio.mutationOptions({
      onSuccess: (next) => {
        setAnalysis(next);
        toast.success("Website-system analysis ready");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const copy = async (value: string, target: "recommendations" | "prompt") => {
    await navigator.clipboard.writeText(value);
    setCopied(target);
    toast.success(
      target === "prompt" ? "Coding-agent prompt copied" : "Priorities copied",
    );
    window.setTimeout(() => setCopied(null), 1_500);
  };

  return (
    <section className="mt-5 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4" />
            <h2 className="text-sm font-semibold">Website-system analysis</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Compare {pageCount.toLocaleString()} mapped page records in{" "}
            {scopeLabel} using their inventory, metadata, and up to eight actual
            OG images.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={includeSaved}
              onCheckedChange={setIncludeSaved}
              aria-label="Include saved page analyses"
            />
            Include saved page analyses
          </label>
          <Button
            size="sm"
            loading={analyze.isPending}
            disabled={pageCount === 0}
            onClick={() =>
              analyze.mutate({
                brandId: brandId ?? undefined,
                includeSavedPageAnalyses: includeSaved,
              })
            }
          >
            <Sparkles className="size-3.5" />
            {analysis
              ? "Re-analyze"
              : brandId
                ? "Analyze website"
                : "Analyze all websites"}
          </Button>
        </div>
      </div>

      {analysis && (
        <div className="mt-5 space-y-5 border-t pt-5">
          <p className="text-sm leading-relaxed">{analysis.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(analysis.health).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-muted/50 p-3">
                <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {key === "visualConsistency" ? "Visual system" : key}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <AnalysisList title="What works" items={analysis.strengths} />
            <AnalysisList
              title="Systemic issues"
              items={analysis.systemicIssues}
            />
          </div>

          <div>
            <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Priorities
            </h3>
            <div className="mt-2 space-y-2">
              {analysis.priorities.map((item) => (
                <div
                  key={`${item.priority}-${item.title}`}
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">
                      {item.priority}
                    </span>
                    <span className="text-sm font-medium">{item.title}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {item.rationale}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed">
                    {item.recommendedAction}
                  </p>
                  {item.affectedPages.length > 0 && (
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {item.affectedPages.join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <AnalysisList
              title="Opportunities"
              items={analysis.opportunities}
            />
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-xs font-medium">
                Page findings · {analysis.pageFindings.length}
              </summary>
              <div className="mt-3 space-y-3">
                {analysis.pageFindings.map((finding) => (
                  <div key={`${finding.path}-${finding.finding}`}>
                    <div className="font-mono text-[10px]">{finding.path}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {finding.finding}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed">
                      {finding.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void copy(
                  analysis.priorities
                    .map(
                      (item, index) =>
                        `${index + 1}. [${item.priority.toUpperCase()}] ${item.title}\n${item.recommendedAction}`,
                    )
                    .join("\n\n"),
                  "recommendations",
                )
              }
            >
              {copied === "recommendations" ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              Copy priorities
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copy(analysis.handoffPrompt, "prompt")}
            >
              {copied === "prompt" ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              Copy coding-agent prompt
            </Button>
            <span className="text-[10px] text-muted-foreground">
              {analysis.scope.pagesAnalyzed} pages ·{" "}
              {analysis.scope.imagesAnalyzed} images ·{" "}
              {analysis.scope.includedSavedPageAnalyses
                ? "deep analyses included · "
                : ""}
              {new Date(analysis.analyzedAt).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
