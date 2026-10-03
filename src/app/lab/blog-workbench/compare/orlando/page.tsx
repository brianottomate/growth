import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { posts } from "#velite";
import { MDXContent } from "@/components/mdx/MDXContent";
import { Prose } from "@/components/mdx/Prose";
import type { ContentBriefInput } from "@/server/services/blog-workbench/contract";
import type { EvaluatorReceipt } from "@/server/services/blog-workbench/evaluate";
import type { CheckReceipt } from "@/server/services/blog-workbench/checks";

type Comparison = {
  runId: string;
  originalSlug: string;
  generatedSlug: string;
  sourceUrl: string;
  sourceTitle: string;
  createdAt: string;
  brief: ContentBriefInput;
  groundingProvenance: string;
  writerModel: string;
  layoutModel: string;
  runEvaluation: EvaluatorReceipt;
  layoutEvaluation: EvaluatorReceipt;
  checks: CheckReceipt[];
  presentationNote?: string;
};
export default async function OrlandoComparison() {
  let comparison: Comparison;
  try {
    comparison = JSON.parse(
      await readFile(
        path.resolve("fixtures/blog/comparisons/orlando/comparison.json"),
        "utf8",
      ),
    ) as Comparison;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      notFound();
    throw error;
  }
  const original = posts.find((p) => p.slug === comparison.originalSlug);
  const generated = posts.find((p) => p.slug === comparison.generatedSlug);
  if (!original || !generated) notFound();
  return (
    <main className="mx-auto max-w-[1800px] px-6 py-10">
      <Link href="/lab/blog-workbench" className="text-sm underline">
        Back to blog lab
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">
        Orlando guide: original vs Growth
      </h1>
      <p className="mt-3 max-w-4xl text-sm leading-relaxed text-secondary">
        A frozen Wander article beside a new agent-generated draft. Both use the
        same Velite typography. The original preserves the published body;
        Growth adds a separate typed layout pass using the new components.
        Neither draft is published.
      </p>
      <p className="mt-3 max-w-4xl text-sm text-secondary">
        Article prose uses frozen source facts; card photos and details come
        from captured public listing API responses. No live PMS validation.
        Compare usefulness, evidence, writing and layout separately. Model
        review is a signal, not a claim that Growth won.
      </p>
      <div className="mt-5 flex flex-wrap gap-4 text-sm underline">
        <a
          href={comparison.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Live DatoCMS article ↗
        </a>
        <Link
          href={`/lab/blog-workbench/preview/${original.slug}`}
          target="_blank"
        >
          Original in its own tab ↗
        </Link>
        <Link
          href={`/lab/blog-workbench/preview/${generated.slug}`}
          target="_blank"
        >
          Growth in its own tab ↗
        </Link>
      </div>
      <p className="mt-4 text-sm font-medium">
        Model review: prose {comparison.runEvaluation.verdict}; displayed layout{" "}
        {comparison.layoutEvaluation.verdict}. Review comments are available
        below.
      </p>
      {comparison.presentationNote ? (
        <p className="mt-2 max-w-4xl text-sm text-secondary">
          {comparison.presentationNote}
        </p>
      ) : null}
      <details className="mt-6 rounded-xl border p-4">
        <summary className="cursor-pointer font-medium">
          Extracted brief, evidence and run receipts
        </summary>
        <p className="mt-4 text-sm">
          Run {comparison.runId} · writer {comparison.writerModel} · layout{" "}
          {comparison.layoutModel}
        </p>
        <p className="mt-3 text-sm">{comparison.groundingProvenance}</p>
        <p className="mt-3 font-medium">{comparison.brief.guestIntent}</p>
        <p className="mt-2 text-sm">{comparison.brief.summary}</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          {comparison.brief.outline.map((section) => (
            <li key={section.heading}>
              <strong>{section.heading}</strong>
              <p>{section.keyPoints.join(" · ")}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 font-medium">
          Prose verdict: {comparison.runEvaluation.verdict} · displayed layout
          verdict: {comparison.layoutEvaluation.verdict}
        </p>
        <p className="mt-2 text-sm">{comparison.layoutEvaluation.summary}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {comparison.checks.map((check) => (
            <li key={check.id}>
              {check.name}: {check.status} — {check.summary}
            </li>
          ))}
        </ul>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {comparison.layoutEvaluation.comments.map((comment, index) => (
            <li key={index}>
              <strong>
                {comment.severity}: {comment.sectionHeading}
              </strong>{" "}
              — {comment.note}
            </li>
          ))}
        </ul>
      </details>
      <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {[
          { label: "Published original · frozen content", post: original },
          { label: "Growth runner · custom component layout", post: generated },
        ].map(({ label, post }) => (
          <section key={post.slug} className="min-w-0 rounded-2xl border">
            <h2 className="border-b bg-surface-secondary px-6 py-4 text-lg font-semibold">
              {label}
            </h2>
            <div
              className="max-h-[80dvh] overflow-auto px-6 py-8"
              role="region"
              aria-label={label}
              tabIndex={0}
            >
              <h3 className="mb-8 text-3xl font-semibold tracking-tight">
                {post.h1}
              </h3>
              <Prose>
                <MDXContent
                  code={post.content}
                  hideDraftEvidence={post.slug === generated.slug}
                />
              </Prose>
            </div>
          </section>
        ))}
      </div>
      <aside
        aria-label="Draft evidence"
        className="mt-6 rounded-2xl border bg-surface-secondary p-6"
      >
        <h2 className="font-semibold">Draft evidence</h2>
        <p className="mt-2 text-sm leading-relaxed break-words text-secondary">
          {comparison.groundingProvenance}
        </p>
      </aside>
      <section className="mt-10 overflow-hidden rounded-2xl border">
        <div className="border-b bg-surface-secondary px-6 py-4">
          <h2 className="text-lg font-semibold">Live Wander article</h2>
          <p className="mt-1 text-sm text-secondary">
            Live page iframe. Wander.com currently blocks cross-origin embeds,
            so this browser may show a blocked frame.{" "}
            <a
              href={comparison.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Open on wander.com ↗
            </a>
          </p>
        </div>
        <iframe
          src={comparison.sourceUrl}
          title={`Live Wander article: ${comparison.sourceTitle}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-[80dvh] min-h-[600px] w-full border-0"
        />
      </section>
    </main>
  );
}
