"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Sparkles } from "lucide-react";

import type {
  ContentAnalysis,
  ContentArtifactKind,
} from "@/lib/content-analysis";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

export function ContentAnalysisPanel({
  id,
  kind,
  initialAnalysis,
  sourceUrl,
}: {
  id: string;
  kind: ContentArtifactKind;
  initialAnalysis: ContentAnalysis | null;
  sourceUrl?: string | null;
}) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [steer, setSteer] = useState("");
  const [copied, setCopied] = useState<"recommendations" | "prompt" | null>(
    null,
  );
  const analyze = useMutation(
    orpc.contentAnalysis.analyze.mutationOptions({
      onSuccess: (next) => {
        setAnalysis(next);
        setSteer("");
        toast.success("Analysis ready");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const copy = async (value: string, target: "recommendations" | "prompt") => {
    await navigator.clipboard.writeText(value);
    setCopied(target);
    toast.success(
      target === "prompt"
        ? "Coding-agent prompt copied"
        : "Recommendations copied",
    );
    window.setTimeout(() => setCopied(null), 1_500);
  };

  return (
    <section className="mt-8 rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4" />
            <h2 className="text-sm font-semibold">AI analysis</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Advisory only. Re-analysis never changes the source project.
          </p>
        </div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Source <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      {analysis ? (
        <div className="mt-5 space-y-5">
          <p className="text-sm leading-relaxed">{analysis.summary}</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.themes.map((theme) => (
              <span
                key={theme}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px]"
              >
                {theme}
              </span>
            ))}
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] capitalize">
              {analysis.funnelStage}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 @2xl:grid-cols-2">
            <AnalysisList title="What works" items={analysis.strengths} />
            <AnalysisList
              title="Watchouts"
              items={analysis.risks}
              empty="No material risks identified."
            />
          </div>
          <AnalysisList
            title="Recommended changes"
            items={analysis.recommendations}
            ordered
          />
          <SpecializedAnalysis analysis={analysis} />

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void copy(
                  analysis.recommendations
                    .map((item, index) => `${index + 1}. ${item}`)
                    .join("\n"),
                  "recommendations",
                )
              }
            >
              {copied === "recommendations" ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              Copy recommendations
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
            <span className="self-center text-[10px] text-muted-foreground">
              {new Date(analysis.analyzedAt).toLocaleString()} ·{" "}
              {analysis.model}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          Analyze the full {kind} source for its audience, purpose, structure,
          strengths, risks, and concrete improvements.
        </p>
      )}

      <div className="mt-5 space-y-2 border-t pt-4">
        <Textarea
          value={steer}
          onChange={(event) => setSteer(event.target.value)}
          maxLength={1_000}
          rows={2}
          placeholder="Optional guidance or correction for the analysis…"
        />
        <Button
          size="sm"
          loading={analyze.isPending}
          onClick={() =>
            analyze.mutate({ id, kind, steer: steer.trim() || undefined })
          }
        >
          <Sparkles className="size-3.5" />
          {analysis ? "Re-analyze" : `Analyze ${kind}`}
        </Button>
      </div>
    </section>
  );
}

function AnalysisList({
  title,
  items,
  ordered = false,
  empty,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
  empty?: string;
}) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <div>
      <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {items.length ? (
        <Tag
          className={`mt-2 space-y-1.5 text-xs leading-relaxed ${
            ordered ? "list-decimal pl-4" : "list-disc pl-4"
          }`}
        >
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </Tag>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{empty ?? "—"}</p>
      )}
    </div>
  );
}

function SpecializedAnalysis({ analysis }: { analysis: ContentAnalysis }) {
  if (analysis.website) {
    return (
      <div className="grid grid-cols-1 gap-5 border-t pt-4 @2xl:grid-cols-2">
        <div>
          <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Search intent
          </h3>
          <p className="mt-2 text-xs leading-relaxed">
            {analysis.website.searchIntent}
          </p>
        </div>
        <div>
          <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            OG assessment
          </h3>
          <p className="mt-2 text-xs leading-relaxed">
            {analysis.website.ogAssessment}
          </p>
        </div>
      </div>
    );
  }
  if (analysis.blog) {
    return (
      <div className="grid grid-cols-1 gap-5 border-t pt-4 @2xl:grid-cols-2">
        <div>
          <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Thesis
          </h3>
          <p className="mt-2 text-xs leading-relaxed">{analysis.blog.thesis}</p>
        </div>
        <AnalysisList
          title="Repurpose into"
          items={analysis.blog.repurposingIdeas}
        />
      </div>
    );
  }
  if (analysis.newsletter) {
    return (
      <div className="grid grid-cols-1 gap-5 border-t pt-4 @2xl:grid-cols-2">
        <div>
          <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Lifecycle role
          </h3>
          <p className="mt-2 text-xs leading-relaxed">
            {analysis.newsletter.lifecycleRole}
          </p>
        </div>
        <AnalysisList
          title="CTA hierarchy"
          items={analysis.newsletter.ctaHierarchy}
        />
      </div>
    );
  }
  return null;
}
