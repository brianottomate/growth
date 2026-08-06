import Link from "next/link";
import ReactMarkdown from "react-markdown";

import {
  loadDatoDraft,
  loadLatestBlogRun,
  loadRawFixture,
  type BlogRunRecord,
} from "@/server/services/blog-workbench/run";
import type { CheckReceipt } from "@/server/services/blog-workbench/checks";
import type { DatoDraftExport } from "@/server/services/blog-workbench/datocms";

// The Growth Blog Workbench: one complete content-generation run, every
// transformation inspectable. Fixture-backed golden run, not a production
// integration; the missing production inputs are modeled explicitly.

export const dynamic = "force-dynamic";

const VIEWS = [
  "overview",
  "brief",
  "grounding",
  "prompt",
  "article",
  "receipts",
] as const;
type View = (typeof VIEWS)[number];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BlogWorkbenchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const view: View = VIEWS.includes(params.view as View)
    ? (params.view as View)
    : "overview";

  const [run, fixture] = await Promise.all([
    loadLatestBlogRun(),
    loadRawFixture(),
  ]);
  const datoDraft = run ? await loadDatoDraft(run.runId) : null;

  return (
    <main className="min-h-screen bg-[#0b0b0a] text-stone-100">
      <header className="border-b border-white/10 bg-[#0f0f0e] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-semibold">Blog golden run</h1>
              <Pill tone="lime">fixture-backed</Pill>
              {run ? (
                <Pill tone="lime">run {run.runId}</Pill>
              ) : (
                <Pill tone="amber">no run executed yet</Pill>
              )}
            </div>
            <p className="mt-0.5 text-[10px] text-stone-500">
              {fixture.brief.working_title} · {fixture.target_domain} · seo run{" "}
              {fixture.run_id}
            </p>
          </div>
          {run ? (
            <div className="text-right font-mono text-[8px] text-stone-600">
              writer {run.writerModel} · prompt {run.promptVersion}
              <br />
              adapter {run.adapterVersion}
              <br />
              {run.totals.wordCount} words · est $
              {run.totals.estCostUsd?.toFixed(2) ?? "?"} (assumed rates)
            </div>
          ) : (
            <div className="max-w-xs text-right text-[9px] text-stone-500">
              Execute a run first:{" "}
              <code className="text-stone-300">
                bun --conditions=react-server scripts/lab/run-blog-golden.ts
              </code>
            </div>
          )}
        </div>

        <nav className="mt-4 flex flex-wrap gap-1">
          {VIEWS.map((candidate) => (
            <Link
              key={candidate}
              href={`/lab/blog-workbench?view=${candidate}`}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-medium capitalize transition ${
                view === candidate
                  ? "bg-white text-stone-950"
                  : "text-stone-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {candidate}
            </Link>
          ))}
        </nav>
      </header>

      <div className="p-5">
        {view === "overview" ? (
          <OverviewView run={run} datoDraft={datoDraft} />
        ) : null}
        {view === "brief" ? (
          <BriefView run={run} fixtureJson={fixture} />
        ) : null}
        {view === "grounding" ? <GroundingView run={run} /> : null}
        {view === "prompt" ? <PromptView run={run} /> : null}
        {view === "article" ? <ArticleView run={run} /> : null}
        {view === "receipts" ? <ReceiptsView run={run} /> : null}
      </div>
    </main>
  );
}

// ---- VIEWS ------------------------------------------------------------

function OverviewView({
  run,
  datoDraft,
}: {
  run: BlogRunRecord | null;
  datoDraft: DatoDraftExport | null;
}) {
  const stages: Array<{ title: string; detail: string; done: boolean }> = [
    {
      title: "Raw SEO Engine response",
      detail: "fixtures/blog/seo-engine-response.json, preserved verbatim",
      done: true,
    },
    {
      title: "Normalized writer brief",
      detail: run
        ? `adapter ${run.adapterVersion}`
        : "snake_case wire → camelCase ContentBriefInput",
      done: Boolean(run),
    },
    {
      title: "Grounding context",
      detail: run
        ? `${run.stages.grounding.version} · ${run.stages.grounding.context.properties.length} properties from ${run.stages.grounding.crawledUrls.length} crawled pages`
        : "crawl-derived stand-in (production context is a missing input)",
      done: Boolean(run),
    },
    {
      title: "Versioned prompt",
      detail: run
        ? run.promptVersion
        : "Cam's draft buildContentBriefPagePrompt, vendored verbatim",
      done: Boolean(run),
    },
    {
      title: "Generated article",
      detail: run
        ? `${run.stages.article.sections.length} sections · ${run.totals.wordCount} words · ${run.writerModel}`
        : "not generated",
      done: Boolean(run),
    },
    {
      title: "Receipts",
      detail: run
        ? `${run.receipts.deterministic.length} deterministic checks · evaluator verdict ${run.receipts.evaluator.verdict}`
        : "deterministic checks + independent evaluator",
      done: Boolean(run),
    },
  ];

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Pipeline</SectionTitle>
        <div className="grid gap-2 md:grid-cols-3">
          {stages.map((stage, index) => (
            <div
              key={stage.title}
              className={`rounded-xl border p-3 ${
                stage.done
                  ? "border-lime-300/25 bg-lime-300/[0.05]"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center gap-2 text-[10px] font-semibold text-white">
                <span
                  className={`grid size-5 place-items-center rounded-full text-[9px] font-bold ${
                    stage.done
                      ? "bg-lime-300 text-stone-950"
                      : "bg-white/10 text-stone-500"
                  }`}
                >
                  {index + 1}
                </span>
                {stage.title}
              </div>
              <p className="mt-2 text-[9px] leading-relaxed text-stone-500">
                {stage.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {run ? (
        <section>
          <SectionTitle>Model usage (costs are estimates)</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-[10px]">
              <thead className="bg-white/[0.03] text-[8px] tracking-wider text-stone-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Input tok</th>
                  <th className="px-3 py-2">Output tok</th>
                  <th className="px-3 py-2">Latency</th>
                  <th className="px-3 py-2">Est cost</th>
                </tr>
              </thead>
              <tbody>
                {run.usage.map((entry) => (
                  <tr key={entry.stage} className="border-t border-white/5">
                    <td className="px-3 py-2 text-stone-300">{entry.stage}</td>
                    <td className="px-3 py-2 font-mono text-[9px] text-stone-500">
                      {entry.model}
                    </td>
                    <td className="px-3 py-2">{entry.inputTokens ?? "?"}</td>
                    <td className="px-3 py-2">{entry.outputTokens ?? "?"}</td>
                    <td className="px-3 py-2">
                      {entry.latencyMs > 0
                        ? `${Math.round(entry.latencyMs / 1000)}s`
                        : "n/a"}
                    </td>
                    <td className="px-3 py-2">
                      {entry.estCostUsd != null
                        ? `$${entry.estCostUsd.toFixed(3)}`
                        : "?"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {run.transportAdjustments.length > 0 ? (
            <p className="mt-2 text-[9px] text-amber-200/80">
              Transport adjustments: {run.transportAdjustments.join("; ")}
            </p>
          ) : null}
        </section>
      ) : null}

      {run ? (
        <section>
          <SectionTitle>Publish targets (serialized artifacts)</SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-lime-300/25 bg-lime-300/[0.04] p-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-white">
                  Velite MDX (growth blog stack)
                </span>
                <Pill tone="lime">written</Pill>
              </div>
              <p className="mt-1.5 text-[9px] leading-relaxed text-stone-500">
                fixtures/blog/runs/{run.runId}/article.mdx · frontmatter passes
                the production posts schema limits · draft-gated to 9999-12-31
              </p>
            </div>
            <div
              className={`rounded-xl border p-3 ${
                datoDraft?.dastValidation.valid
                  ? "border-lime-300/25 bg-lime-300/[0.04]"
                  : "border-white/12 bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-white">
                  DatoCMS draft (real wander.com blog)
                </span>
                {datoDraft ? (
                  <Pill
                    tone={datoDraft.dastValidation.valid ? "lime" : "amber"}
                  >
                    {datoDraft.dastValidation.valid
                      ? "dast valid"
                      : "dast INVALID"}
                  </Pill>
                ) : (
                  <Pill tone="stone">not derived</Pill>
                )}
              </div>
              <p className="mt-1.5 text-[9px] leading-relaxed text-stone-500">
                {datoDraft
                  ? `blog_article shape: title, slug "${datoDraft.attributes.url}", description, body as structured text. Unresolved at push time: ${datoDraft.unresolved.map((item) => item.field).join(", ")}. Pushing needs a CMA token (CDA token is read-only).`
                  : "Derive with bun --conditions=react-server scripts/lab/export-blog-dato-draft.ts"}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle>Missing inputs (modeled, never fabricated)</SectionTitle>
        <div className="space-y-2">
          {(run?.missingInputs ?? []).map((input) => (
            <div
              key={input.id}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
            >
              <div className="flex items-center gap-2">
                <Pill tone={input.status === "missing" ? "amber" : "stone"}>
                  {input.status}
                </Pill>
                <span className="text-[10px] font-medium text-stone-300">
                  {input.what}
                </span>
              </div>
              {input.substitute ? (
                <p className="mt-1.5 text-[9px] text-stone-500">
                  Substitute: {input.substitute}
                </p>
              ) : null}
            </div>
          ))}
          {!run ? (
            <p className="text-[9px] text-stone-500">
              Execute a run to see the missing-input register it recorded.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function BriefView({
  run,
  fixtureJson,
}: {
  run: BlogRunRecord | null;
  fixtureJson: unknown;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section>
        <SectionTitle>Raw SEO Engine response (snake_case wire)</SectionTitle>
        <JsonBlock value={fixtureJson} />
      </section>
      <section>
        <SectionTitle>
          Normalized writer brief{" "}
          {run ? `(${run.adapterVersion})` : "(run not executed)"}
        </SectionTitle>
        {run ? (
          <JsonBlock value={run.stages.normalizedBrief} />
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
  );
}

function GroundingView({ run }: { run: BlogRunRecord | null }) {
  if (!run) return <EmptyState />;
  const grounding = run.stages.grounding;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.04] p-3 text-[10px] leading-relaxed text-amber-100">
        {grounding.provenance} Derived {formatDate(grounding.derivedAt)} with{" "}
        {grounding.model} from: {grounding.crawledUrls.join(", ")}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <SectionTitle>
            Business facts ({grounding.context.businessName})
          </SectionTitle>
          <JsonBlock value={{ ...grounding.context, properties: undefined }} />
        </section>
        <section>
          <SectionTitle>
            Properties ({grounding.context.properties.length}, real hrefs)
          </SectionTitle>
          <div className="space-y-2">
            {grounding.context.properties.map((property) => (
              <div
                key={property.href}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
              >
                <div className="text-[10px] font-medium text-stone-200">
                  {property.name}
                </div>
                <div className="mt-1 text-[9px] text-stone-500">
                  {[
                    property.bedrooms != null
                      ? `${property.bedrooms} bed`
                      : null,
                    property.sleeps != null
                      ? `sleeps ${property.sleeps}`
                      : null,
                    property.location,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "no numeric facts on the crawled pages"}
                </div>
                <div className="mt-1 truncate font-mono text-[7px] text-stone-600">
                  {property.href}
                </div>
                {property.amenities.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {property.amenities.slice(0, 8).map((amenity) => (
                      <span
                        key={amenity}
                        className="rounded-full border border-white/8 px-2 py-0.5 text-[8px] text-stone-400"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PromptView({ run }: { run: BlogRunRecord | null }) {
  if (!run) return <EmptyState />;
  return (
    <section>
      <SectionTitle>
        Rendered prompt · {run.stages.prompt.version} ·{" "}
        {run.stages.prompt.text.length.toLocaleString()} chars
      </SectionTitle>
      <pre className="max-h-[75vh] overflow-auto rounded-xl border border-white/10 bg-[#0f0f0e] p-4 text-[10px] leading-relaxed whitespace-pre-wrap text-stone-300">
        {run.stages.prompt.text}
      </pre>
    </section>
  );
}

function ArticleView({ run }: { run: BlogRunRecord | null }) {
  if (!run) return <EmptyState />;
  const article = run.stages.article;
  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside>
        <SectionTitle>Storyboard</SectionTitle>
        <div className="space-y-1.5">
          {run.storyboard.map((entry) => (
            <a
              key={entry.index}
              href={`#section-${entry.index}`}
              className="block rounded-xl border border-white/8 bg-white/[0.02] p-3 hover:bg-white/[0.05]"
            >
              <div className="flex items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-lime-300/15 text-[9px] font-bold text-lime-200">
                  {entry.index}
                </span>
                <span className="min-w-0 truncate text-[10px] font-medium text-stone-300">
                  {entry.heading}
                </span>
              </div>
              <div className="mt-1.5 text-[8px] text-stone-600">
                {entry.wordCount} words ·{" "}
                {entry.generatedHeading === entry.heading
                  ? "heading matched"
                  : "heading diverged"}
              </div>
            </a>
          ))}
        </div>
      </aside>
      <section className="min-w-0">
        <div className="rounded-2xl border border-white/10 bg-white p-8 text-stone-900">
          <div className="mb-6 border-b border-stone-200 pb-4">
            <div className="text-[9px] tracking-wider text-stone-400 uppercase">
              metaTitle ({article.metaTitle.length}/60)
            </div>
            <div className="text-sm font-semibold">{article.metaTitle}</div>
            <div className="mt-2 text-[9px] tracking-wider text-stone-400 uppercase">
              metaDescription ({article.metaDescription.length}/160)
            </div>
            <div className="text-xs text-stone-600">
              {article.metaDescription}
            </div>
          </div>
          <h1 className="mb-6 text-2xl font-bold">
            {run.stages.normalizedBrief.workingTitle}
          </h1>
          {article.sections.map((section, index) => (
            <section
              key={section.heading}
              id={`section-${index + 1}`}
              className="mb-8 scroll-mt-4"
            >
              <h2 className="mb-3 text-lg font-semibold">{section.heading}</h2>
              <div className="prose prose-sm prose-stone max-w-none text-[13px] leading-relaxed [&_a]:text-blue-700 [&_a]:underline [&_p]:mb-3">
                <ReactMarkdown>
                  {htmlAnchorsToMarkdown(section.markdown)}
                </ReactMarkdown>
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReceiptsView({ run }: { run: BlogRunRecord | null }) {
  if (!run) return <EmptyState />;
  const evaluator = run.receipts.evaluator;
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Deterministic checks</SectionTitle>
        <div className="grid gap-2 lg:grid-cols-2">
          {run.receipts.deterministic.map((receipt) => (
            <CheckCard key={receipt.id} receipt={receipt} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>
          Independent evaluator · {evaluator.evaluatorVersion} ·{" "}
          {evaluator.model}
        </SectionTitle>
        <div
          className={`rounded-xl border p-4 ${
            evaluator.verdict === "publish_candidate"
              ? "border-lime-300/25 bg-lime-300/[0.05]"
              : evaluator.verdict === "reject"
                ? "border-amber-300/30 bg-amber-300/[0.05]"
                : "border-white/12 bg-white/[0.03]"
          }`}
        >
          <div className="flex items-center gap-2">
            <Pill
              tone={
                evaluator.verdict === "publish_candidate" ? "lime" : "amber"
              }
            >
              {evaluator.verdict.replace(/_/g, " ")}
            </Pill>
            <span className="text-[9px] text-stone-500">
              {evaluator.comments.length} comments
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-stone-300">
            {evaluator.summary}
          </p>
          {evaluator.strengths.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[9px] text-lime-200/80">
              {evaluator.strengths.map((strength) => (
                <li key={strength}>+ {strength}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="mt-3 space-y-2">
          {evaluator.comments.map((comment, index) => (
            <div
              key={index}
              className={`rounded-xl border p-3 ${
                comment.severity === "major"
                  ? "border-amber-300/30 bg-amber-300/[0.04]"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={comment.severity === "major" ? "amber" : "stone"}>
                  {comment.severity} · {comment.kind.replace(/_/g, " ")}
                </Pill>
                <span className="text-[9px] text-stone-500">
                  {comment.sectionHeading}
                </span>
              </div>
              <p className="mt-2 text-[10px] text-stone-400 italic">
                “{comment.excerpt}”
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-stone-300">
                {comment.note}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---- PRIMITIVES ---------------------------------------------------------

function CheckCard({ receipt }: { receipt: CheckReceipt }) {
  const failing = receipt.rows.filter((row) => !row.ok);
  return (
    <div
      className={`rounded-xl border p-3 ${
        receipt.status === "passed"
          ? "border-lime-300/25 bg-lime-300/[0.04]"
          : receipt.status === "failed"
            ? "border-amber-300/30 bg-amber-300/[0.05]"
            : "border-white/12 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-white">
          {receipt.name}
        </span>
        <Pill
          tone={
            receipt.status === "passed"
              ? "lime"
              : receipt.status === "failed"
                ? "amber"
                : "stone"
          }
        >
          {receipt.status.replace(/_/g, " ")}
        </Pill>
      </div>
      <p className="mt-1.5 text-[9px] text-stone-500">{receipt.summary}</p>
      {failing.slice(0, 6).map((row) => (
        <p
          key={row.label}
          className="mt-1 text-[9px] leading-relaxed text-amber-200/85"
        >
          ✗ {row.label}: {row.detail}
        </p>
      ))}
      {failing.length > 6 ? (
        <p className="mt-1 text-[8px] text-stone-600">
          +{failing.length - 6} more rows in run.json
        </p>
      ) : null}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[9px] font-bold tracking-[0.2em] text-stone-500 uppercase">
      {children}
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "lime" | "amber" | "stone";
  children: React.ReactNode;
}) {
  const classes = {
    lime: "bg-lime-300/15 text-lime-200",
    amber: "bg-amber-300/15 text-amber-200",
    stone: "bg-white/10 text-stone-300",
  }[tone];
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[8px] font-bold tracking-widest uppercase ${classes}`}
    >
      {children}
    </span>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-[#0f0f0e] p-4 font-mono text-[9px] leading-relaxed text-stone-400">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-[10px] text-stone-500">
      No run executed yet. Run{" "}
      <code className="text-stone-300">
        bun --conditions=react-server scripts/lab/run-blog-golden.ts
      </code>{" "}
      to produce the first immutable run record.
    </div>
  );
}

// The writer emits property links as raw <a href> per the prompt contract;
// react-markdown renders raw HTML as text, so convert anchors to markdown
// links for display only. The stored artifact keeps the original form.
function htmlAnchorsToMarkdown(markdown: string): string {
  return markdown.replace(
    /<a\s+href="([^"]+)"\s*>([^<]*)<\/a>/g,
    (_match, href: string, label: string) => `[${label}](${href})`,
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
