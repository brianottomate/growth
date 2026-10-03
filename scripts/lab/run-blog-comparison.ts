import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { format } from "oxfmt";
import { executeBlogGoldenRun } from "../../src/server/services/blog-workbench/run";
import { seoEngineBriefSchema } from "../../src/server/services/blog-workbench/contract";
import {
  articleLayoutSchema,
  serializeArticleLayout,
  layoutAsArticle,
} from "../../src/server/services/blog-workbench/layout";
import { evaluateArticle } from "../../src/server/services/blog-workbench/evaluate";
import { escapeArticleMarkdown } from "../../src/server/services/blog-workbench/mdx";
import type { GroundingContextRecord } from "../../src/server/services/blog-workbench/grounding";
import { EDITORIAL_RULES } from "../../src/server/services/blog-workbench/editorial";

const fixtureDirectory = path.resolve("fixtures/blog/comparisons/orlando");
async function writeFixtureJson(file: string, value: unknown) {
  const formatted = await format(file, JSON.stringify(value, null, 2) + "\n");
  if (formatted.errors.length)
    throw new Error("Comparison fixture formatting failed");
  await writeFile(file, formatted.code);
}
const source = JSON.parse(
  await readFile(path.join(fixtureDirectory, "source.json"), "utf8"),
) as {
  title: string;
  sourceUrl: string;
  capturedAt: string;
  markdown: string;
  author: string;
  publishedAt: string;
  images: { src: string; alt: string }[];
};
const contextSchema = z.object({
  businessName: z.string(),
  summary: z.string().nullable(),
  locations: z.array(z.string()),
  amenities: z.array(z.string()),
  activities: z.array(z.string()),
  targetAudience: z.string().nullable(),
  distinctiveFeatures: z.array(z.string()),
  typicalPriceRange: z.string().nullable(),
  voice: z.string().nullable(),
  properties: z.array(
    z.object({
      name: z.string(),
      href: z.string(),
      sleeps: z.number().nullable(),
      bedrooms: z.number().nullable(),
      location: z.string().nullable(),
      amenities: z.array(z.string()),
    }),
  ),
});
let prepared: {
  brief: z.infer<typeof seoEngineBriefSchema>;
  context: z.infer<typeof contextSchema>;
};
const preparationPath = path.join(fixtureDirectory, "extracted-brief.json");
try {
  prepared = JSON.parse(
    await readFile(preparationPath, "utf8"),
  ) as typeof prepared;
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
    throw error;
  console.log("stage: extract brief and source-derived facts");
  const result = await generateText({
    model: anthropic("claude-sonnet-5"),
    output: Output.object({
      schema: z.object({ brief: seoEngineBriefSchema, context: contextSchema }),
    }),
    maxOutputTokens: 12000,
    system:
      "Extract a writing assignment and grounding facts from a frozen Wander article. The brief describes the traveler decision and coverage, not the original wording. Create 6-8 useful outline sections, 1400 suggested words. IDs must explicitly say source-derived-demo. Context must include rich seasonal facts, exact property names/links and explicitly stated amenities. Put source-supported seasonal facts in summary/distinctiveFeatures. Do not invent facts, capacities, price bands or expert attribution. Null unknowns. Do not treat anonymous first-person quotes as authorized expert testimony. Source recommendations conflict: preserve granular conditions rather than choose a universal best month. Writer will receive ONLY this extracted assignment and facts, not the original prose.",
    prompt: source.markdown,
  });
  prepared = result.output;
  await writeFixtureJson(preparationPath, {
    ...prepared,
    extractionUsage: result.usage,
    model: "claude-sonnet-5",
    sourceUrl: source.sourceUrl,
  });
}
const response = {
  run_id: "source-derived-orlando-demo",
  target_domain: "wander.com",
  status: "completed",
  brief_id: prepared.brief.brief_id,
  error: null,
  brief: prepared.brief,
};
await writeFixtureJson(
  path.join(fixtureDirectory, "seo-engine-response.json"),
  response,
);
const grounding: GroundingContextRecord = {
  version: "source-article-derived/v1",
  provenance: `Source-derived comparison fixture from ${source.sourceUrl}, captured ${source.capturedAt}. Claims are from the published article, not independently verified or live PMS data. This tests regeneration and layout, not fresh research.`,
  targetDomain: "wander.com",
  crawledUrls: [source.sourceUrl],
  derivedAt: source.capturedAt,
  model: "claude-sonnet-5",
  usage: { inputTokens: null, outputTokens: null },
  context: prepared.context,
};
await writeFixtureJson(
  path.join(fixtureDirectory, "grounding.json"),
  grounding,
);
const run = await executeBlogGoldenRun({
  fixtureDirectory,
  response,
  grounding,
  visualDirections: [],
  missingInputs: [
    {
      id: "source-derived-demo",
      what: "Live independently researched facts and PMS inventory",
      status: "substituted",
      substitute: grounding.provenance,
    },
    {
      id: "live-discovery-brief",
      what: "Measured Discovery recommendation",
      status: "substituted",
      substitute:
        "Brief extracted from the frozen source article; no visibility measurements.",
    },
  ],
  onStage: (s) => console.log(`stage: ${s}`),
});
console.log(`saved run: ${run.runId}`);
console.log("stage: typed editorial layout");
const layoutResult = await generateText({
  model: anthropic("claude-sonnet-5"),
  output: Output.object({ schema: articleLayoutSchema }),
  maxOutputTokens: 16000,
  system:
    "Arrange this generated article using typed editorial components. Keep exact heading count/order. Preserve its strongest prose. Use quick answers near the start, one comparison table, seasonal tradeoffs, and property recommendation cards where useful. Move content into blocks instead of duplicating the same prose. Before and after are plain Markdown, never JSX or module statements. No invented facts, quotes, imagery or links. Use exact links supplied in grounding. Keep summary/table/conclusion recommendations consistent. Do not pad. This is layout and editing of the runner's output, not a new unsupported article.\n" +
    EDITORIAL_RULES,
  prompt: JSON.stringify({
    article: run.stages.article,
    context: prepared.context,
  }),
});
const layout = layoutResult.output;
const runDirectory = path.join(fixtureDirectory, "runs", run.runId);
await writeFile(
  path.join(runDirectory, "layout.json"),
  JSON.stringify(
    { layout, usage: layoutResult.usage, model: "claude-sonnet-5" },
    null,
    2,
  ) + "\n",
);
console.log("stage: evaluate displayed layout copy");
const layoutEvaluation = await evaluateArticle(
  layoutAsArticle(run.stages.article, layout),
  run.stages.normalizedBrief,
  prepared.context,
);
await writeFile(
  path.join(runDirectory, "layout-evaluation.json"),
  JSON.stringify(layoutEvaluation, null, 2) + "\n",
);
const originalSlug = "builder-orlando-original";
const generatedSlug = `builder-orlando-${run.runId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
const frontmatter = (title: string) =>
  `---\nh1: ${JSON.stringify(title)}\nmetaTitle: ${JSON.stringify(title.slice(0, 60))}\nmetaDescription: "Internal frozen-source comparison draft."\npublishedAt: "9999-12-31"\ncategory: Guides\ntags: []\nshowStickyCTA: false\nenableAutoCtAs: false\n---\n\n`;
const hero = source.images[0];
const heroMdx = hero
  ? `<ArticleFigure src={${JSON.stringify(hero.src)}} alt="Published source article cover reused for comparison" credit="Cover from the published Wander article; shared across both versions for this demo." />\n\n`
  : "";
const original =
  frontmatter(source.title.trim()) +
  `Original by ${escapeArticleMarkdown(source.author)}, ${source.publishedAt}. [View published article](${source.sourceUrl}).\n\n` +
  heroMdx +
  escapeArticleMarkdown(source.markdown) +
  "\n";
const generated = serializeArticleLayout(
  run,
  layout,
  prepared.context.properties.map((p) => p.href),
);
// Use the same published cover, without pretending it depicts a recommended home.
const separator = generated.indexOf("\n## ");
const withHero =
  separator < 0
    ? generated
    : generated.slice(0, separator) +
      "\n" +
      heroMdx +
      generated.slice(separator);
await mkdir(path.resolve("content/posts"), { recursive: true });
const outputs: Array<[string, string]> = [
  [originalSlug, original],
  [generatedSlug, withHero],
];
for (const [slug, mdx] of outputs) {
  const file = path.resolve("content/posts", `${slug}.mdx`);
  const formatted = await format(file, mdx, { printWidth: 80 });
  if (formatted.errors.length)
    throw new Error("Comparison MDX formatting failed");
  await writeFile(file, formatted.code);
}
await writeFixtureJson(path.join(fixtureDirectory, "comparison.json"), {
  runId: run.runId,
  originalSlug,
  generatedSlug,
  sourceUrl: source.sourceUrl,
  sourceTitle: source.title,
  createdAt: new Date().toISOString(),
  brief: run.stages.normalizedBrief,
  groundingProvenance: grounding.provenance,
  writerModel: run.writerModel,
  layoutModel: "claude-sonnet-5",
  runEvaluation: run.receipts.evaluator,
  layoutEvaluation,
  checks: run.receipts.deterministic,
  usage: run.usage,
  layoutUsage: layoutResult.usage,
});
await import("./enrich-blog-comparison");
console.log(
  `ready: /lab/blog-workbench/compare/orlando; layout verdict: ${layoutEvaluation.verdict}`,
);
