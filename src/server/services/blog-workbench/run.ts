import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import { buildDatoDraftExport, type DatoDraftExport } from "./datocms";
import { loadBlogVisualDirections, loadLatestBlogRun } from "./artifacts";
import { runDeterministicChecks, type CheckReceipt } from "./checks";
import type { GeneratedArticle } from "./checks";
import {
  ADAPTER_VERSION,
  MISSING_INPUTS,
  normalizeSeoResponseToBrief,
  seoEngineResponseSchema,
  type ContentBriefInput,
  type MissingInput,
  type SeoEngineResponse,
} from "./contract";
import { evaluateArticle, type EvaluatorReceipt } from "./evaluate";
import {
  buildCrawlDerivedGrounding,
  type GroundingContextRecord,
} from "./grounding";
import { buildContentBriefPagePrompt, PROMPT_VERSION } from "./prompt";
import {
  evaluatorCommentsToWorkbench,
  generatedStoryboardSchema,
  normalizeStoryboardVisualPlacements,
  WORKBENCH_VERSION,
  type GeneratedStoryboard,
  type VisualDirection,
  type WorkbenchComment,
} from "./workflow";

// The executable golden run: one complete content-generation run, persisted
// as an immutable record the workbench renders. Successful runs are never
// edited; a rerun writes a new directory and latest.json moves.

export const RUN_SCHEMA_VERSION = "blog-golden-run/v2";

const WRITER_MODEL = "claude-opus-5";
const STORYBOARD_MODEL = "claude-sonnet-5";

// Assumed per-MTok USD rates for the cost estimate. Estimates only; verify
// against current pricing before quoting anywhere that matters.
const ESTIMATED_RATES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 15, output: 75 },
  "claude-sonnet-5": { input: 3, output: 15 },
};

export type UsageEntry = {
  stage: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  estCostUsd: number | null;
};

export type BlogRunRecord = {
  schemaVersion: typeof RUN_SCHEMA_VERSION | "blog-golden-run/v1";
  runId: string;
  createdAt: string;
  fixturePath: string;
  adapterVersion: string;
  promptVersion: string;
  writerModel: string;
  missingInputs: MissingInput[];
  transportAdjustments: string[];
  stages: {
    rawResponse: SeoEngineResponse;
    normalizedBrief: ContentBriefInput;
    grounding: GroundingContextRecord;
    prompt: { version: string; text: string };
    draftArticle?: GeneratedArticle;
    article: GeneratedArticle;
  };
  storyboard: Array<{
    index: number;
    heading: string;
    keyPoints: string[];
    generatedHeading: string | null;
    wordCount: number;
    id?: string;
    purpose?: string;
    visualDirectionIds?: string[];
    promotion?: {
      decision: "none" | "property-links" | "comparison";
      rationale: string;
    };
  }>;
  workflow?: {
    version: typeof WORKBENCH_VERSION;
    previousRunId: string | null;
    sourceCommentIds: string[];
  };
  visualDirections?: VisualDirection[];
  comments?: WorkbenchComment[];
  receipts: {
    deterministic: CheckReceipt[];
    evaluator: EvaluatorReceipt;
  };
  usage: UsageEntry[];
  totals: { estCostUsd: number | null; wordCount: number; latencyMs: number };
};

const FIXTURE_DIR = path.resolve("fixtures/blog");
const FIXTURE_RESPONSE = path.join(FIXTURE_DIR, "seo-engine-response.json");

// Long-form prose is generated as plain markdown, not structured JSON: a
// 1,600-word article inside a strict schema is exactly the shape that dies
// on provider validation (the first attempt came back without a valid
// `sections` array). Sections are split deterministically at `## ` headings
// afterwards, and SEO metadata comes from a separate small structured call.
const MetadataOutput = z.object({
  metaTitle: z
    .string()
    .describe("SEO title tag for the page, at most 60 characters"),
  metaDescription: z
    .string()
    .describe("SEO meta description, at most 160 characters"),
});

export async function executeBlogGoldenRun(): Promise<BlogRunRecord> {
  const previousRun = await loadLatestBlogRun();
  const previousComments = previousRun
    ? (
        previousRun.comments ??
        evaluatorCommentsToWorkbench(previousRun.receipts.evaluator)
      ).filter((comment) => comment.status === "open")
    : [];
  const visualDirections = await loadBlogVisualDirections();
  const raw = seoEngineResponseSchema.parse(
    JSON.parse(await readFile(FIXTURE_RESPONSE, "utf8")),
  );
  const brief = normalizeSeoResponseToBrief(raw);

  // Grounding is cached on disk: the crawl-derived stand-in is itself a
  // fixture once built, so reruns iterate on generation, not crawling.
  const groundingPath = path.join(
    FIXTURE_DIR,
    "grounding",
    `${raw.target_domain.replace(/[^a-z0-9]+/gi, "-")}.json`,
  );
  let grounding: GroundingContextRecord;
  try {
    grounding = JSON.parse(
      await readFile(groundingPath, "utf8"),
    ) as GroundingContextRecord;
  } catch {
    grounding = await buildCrawlDerivedGrounding(raw.target_domain);
    await mkdir(path.dirname(groundingPath), { recursive: true });
    await writeFile(
      groundingPath,
      `${JSON.stringify(grounding, null, 2)}\n`,
      "utf8",
    );
  }

  const promptText = buildContentBriefPagePrompt(brief, grounding.context);

  const usage: UsageEntry[] = [];
  const transportAdjustments: string[] = [];

  const storyboardStart = Date.now();
  const { output: storyboardOutput, usage: storyboardUsage } =
    await generateText({
      model: anthropic(STORYBOARD_MODEL),
      output: Output.object({ schema: generatedStoryboardSchema }),
      maxOutputTokens: 8_000,
      system: [
        "Plan the editorial structure for a grounded vacation-rental guide.",
        "Keep one section for every supplied outline heading, in the same order.",
        "Give each section one job. Assign a visual only when it helps the reader make a decision.",
        "Use only registered visual IDs. Promotion must serve the section rather than interrupt it.",
      ].join("\n"),
      prompt: [
        "# Brief",
        JSON.stringify(brief, null, 2),
        "",
        "# Grounding context",
        JSON.stringify(grounding.context, null, 2),
        "",
        "# Registered visual directions",
        JSON.stringify(visualDirections, null, 2),
        "",
        "# Comments from the previous immutable run",
        JSON.stringify(previousComments, null, 2),
      ].join("\n"),
    });
  assertStoryboardMatchesBrief(storyboardOutput, brief, visualDirections);
  const generatedStoryboard =
    normalizeStoryboardVisualPlacements(storyboardOutput);
  usage.push(
    usageEntry(
      "storyboard",
      STORYBOARD_MODEL,
      storyboardUsage,
      Date.now() - storyboardStart,
    ),
  );

  const writerStart = Date.now();
  const { text: draftMarkdown, usage: writerUsage } = await generateText({
    model: anthropic(WRITER_MODEL),
    maxOutputTokens: 32_000,
    system: promptText,
    prompt: [
      "Write the guide now as markdown, following the section outline",
      "exactly: one `## ` heading per outline heading, verbatim, in order.",
      "No title line before the first heading, no closing sign-off after",
      "the last section.",
      "",
      "# Editorial storyboard",
      JSON.stringify(generatedStoryboard, null, 2),
      "",
      "# Previous review comments to address",
      JSON.stringify(previousComments, null, 2),
      "",
      "Visual directions belong to separate fulfillment owners. Do not claim an image exists or describe an unseen asset as proof.",
    ].join("\n"),
  });
  usage.push(
    usageEntry("writer", WRITER_MODEL, writerUsage, Date.now() - writerStart),
  );

  const draftSections = splitMarkdownSections(
    draftMarkdown,
    transportAdjustments,
  );

  const revisionStart = Date.now();
  const { text: revisedMarkdown, usage: revisionUsage } = await generateText({
    model: anthropic(WRITER_MODEL),
    maxOutputTokens: 32_000,
    system: promptText,
    prompt: [
      "Edit this complete draft once before independent evaluation.",
      "Preserve the exact section headings and order. Remove unsupported claims, generic filler, manufactured punchlines, repeated conclusions, and unearned promotion.",
      "Address every applicable previous comment. Preserve a visual direction only where its placement helps the surrounding decision.",
      "Return the complete markdown article with one `## ` heading per storyboard section. Return no commentary around it.",
      "",
      "# Storyboard",
      JSON.stringify(generatedStoryboard, null, 2),
      "",
      "# Previous review comments",
      JSON.stringify(previousComments, null, 2),
      "",
      "# Draft",
      draftMarkdown,
    ].join("\n"),
  });
  usage.push(
    usageEntry(
      "editorial-revision",
      WRITER_MODEL,
      revisionUsage,
      Date.now() - revisionStart,
    ),
  );
  const sections = splitMarkdownSections(revisedMarkdown, transportAdjustments);

  const metadataStart = Date.now();
  const { output: metadata, usage: metadataUsage } = await generateText({
    model: anthropic("claude-sonnet-5"),
    output: Output.object({ schema: MetadataOutput }),
    system: [
      "Write SEO metadata for the article below. metaTitle at most 60",
      "characters, metaDescription at most 160. Plain, specific, no",
      "clickbait, no em dashes.",
    ].join("\n"),
    prompt: [
      `Working title: ${brief.workingTitle}`,
      `Target query: ${brief.targetQuery}`,
      "",
      revisedMarkdown.slice(0, 8_000),
    ].join("\n"),
  });
  usage.push(
    usageEntry(
      "metadata",
      "claude-sonnet-5",
      metadataUsage,
      Date.now() - metadataStart,
    ),
  );

  // The narrow transport adapter from the blog-workbench handoff: metadata
  // slightly over a hard limit is shortened at a word boundary and recorded,
  // instead of discarding an otherwise complete article. Deliberately small;
  // resist growing it into a rewriting utility.
  const article: GeneratedArticle = {
    metaTitle: shortenAtWordBoundary(
      metadata.metaTitle,
      60,
      "metaTitle",
      transportAdjustments,
    ),
    metaDescription: shortenAtWordBoundary(
      metadata.metaDescription,
      160,
      "metaDescription",
      transportAdjustments,
    ),
    sections,
  };

  const deterministic = runDeterministicChecks(
    article,
    brief,
    grounding.context,
  );
  const evaluator = await evaluateArticle(article, brief, grounding.context);
  usage.push({
    stage: "evaluator",
    model: evaluator.model,
    inputTokens: evaluator.usage.inputTokens,
    outputTokens: evaluator.usage.outputTokens,
    latencyMs: evaluator.latencyMs,
    estCostUsd: estimateCost(evaluator.model, evaluator.usage),
  });
  if (grounding.usage.inputTokens != null) {
    usage.push({
      stage: "grounding-extraction",
      model: grounding.model,
      inputTokens: grounding.usage.inputTokens,
      outputTokens: grounding.usage.outputTokens,
      latencyMs: 0,
      estCostUsd: estimateCost(grounding.model, grounding.usage),
    });
  }

  const runId = `bgr_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const record: BlogRunRecord = {
    schemaVersion: RUN_SCHEMA_VERSION,
    runId,
    createdAt: new Date().toISOString(),
    fixturePath: "fixtures/blog/seo-engine-response.json",
    adapterVersion: ADAPTER_VERSION,
    promptVersion: PROMPT_VERSION,
    writerModel: WRITER_MODEL,
    missingInputs: MISSING_INPUTS,
    transportAdjustments,
    stages: {
      rawResponse: raw,
      normalizedBrief: brief,
      grounding,
      prompt: { version: PROMPT_VERSION, text: promptText },
      draftArticle: {
        metaTitle: article.metaTitle,
        metaDescription: article.metaDescription,
        sections: draftSections,
      },
      article,
    },
    storyboard: generatedStoryboard.sections.map((section, index) => ({
      index: index + 1,
      heading: section.heading,
      keyPoints: section.keyPoints,
      generatedHeading: article.sections[index]?.heading ?? null,
      wordCount: countWords(article.sections[index]?.markdown ?? ""),
      id: section.id,
      purpose: section.purpose,
      visualDirectionIds: section.visualDirectionIds,
      promotion: section.promotion,
    })),
    workflow: {
      version: WORKBENCH_VERSION,
      previousRunId: previousRun?.runId ?? null,
      sourceCommentIds: previousComments.map((comment) => comment.id),
    },
    visualDirections,
    comments: evaluatorCommentsToWorkbench(evaluator),
    receipts: { deterministic, evaluator },
    usage,
    totals: {
      estCostUsd: sumCosts(usage),
      wordCount: article.sections.reduce(
        (total, section) => total + countWords(section.markdown),
        0,
      ),
      latencyMs: usage.reduce((total, entry) => total + entry.latencyMs, 0),
    },
  };

  const runDirectory = path.join(FIXTURE_DIR, "runs", runId);
  await mkdir(runDirectory, { recursive: true });
  await writeFile(
    path.join(runDirectory, "run.json"),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(runDirectory, "article.mdx"),
    serializeArticleMdx(record),
    "utf8",
  );
  await writeFile(
    path.join(runDirectory, "datocms-draft.json"),
    `${JSON.stringify(buildDatoDraftExport(record), null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(FIXTURE_DIR, "runs", "latest.json"),
    `${JSON.stringify({ runId }, null, 2)}\n`,
    "utf8",
  );

  return record;
}

/**
 * Derives (or re-derives) the DatoCMS draft for an already-persisted run.
 * Serializers are deterministic over run.json, so this is a derived artifact,
 * not a mutation of the immutable run record.
 */
export async function exportDatoDraftForRun(
  runId?: string,
): Promise<{ runId: string; export: DatoDraftExport; path: string }> {
  const resolvedRunId =
    runId ??
    (
      JSON.parse(
        await readFile(path.join(FIXTURE_DIR, "runs", "latest.json"), "utf8"),
      ) as { runId: string }
    ).runId;
  const record = JSON.parse(
    await readFile(
      path.join(FIXTURE_DIR, "runs", resolvedRunId, "run.json"),
      "utf8",
    ),
  ) as BlogRunRecord;

  const draft = buildDatoDraftExport(record);
  const exportPath = path.join(
    FIXTURE_DIR,
    "runs",
    resolvedRunId,
    "datocms-draft.json",
  );
  await writeFile(exportPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  return { runId: resolvedRunId, export: draft, path: exportPath };
}

/**
 * Serializes the typed article into MDX with frontmatter shaped for the
 * production velite posts collection. Drafts publish at the end of time,
 * so compiling one never surfaces it as published content.
 */
function serializeArticleMdx(record: BlogRunRecord): string {
  const { article, normalizedBrief } = record.stages;
  const frontmatter = [
    "---",
    `h1: ${JSON.stringify(normalizedBrief.workingTitle)}`,
    `metaTitle: ${JSON.stringify(article.metaTitle)}`,
    `metaDescription: ${JSON.stringify(article.metaDescription)}`,
    `publishedAt: "9999-12-31"`,
    `category: Guides`,
    `tags: []`,
    "---",
  ].join("\n");
  const body = article.sections
    .map((section) => `## ${section.heading}\n\n${section.markdown}`)
    .join("\n\n");
  return `${frontmatter}\n\n${body}\n`;
}

/**
 * Deterministic transport step: split the writer's markdown into sections at
 * `## ` headings. Preamble before the first heading is folded into the first
 * section and recorded as an adjustment rather than silently dropped.
 */
function splitMarkdownSections(
  markdown: string,
  adjustments: string[],
): Array<{ heading: string; markdown: string }> {
  const sections: Array<{ heading: string; markdown: string }> = [];
  let preamble = "";
  let current: { heading: string; markdown: string } | null = null;

  for (const line of markdown.split("\n")) {
    const headingMatch = /^##\s+(.+?)\s*$/.exec(line);
    if (headingMatch?.[1]) {
      if (current) sections.push(current);
      current = { heading: headingMatch[1], markdown: "" };
      continue;
    }
    if (current) {
      current.markdown += `${line}\n`;
    } else if (line.trim() && !/^#\s/.test(line)) {
      preamble += `${line}\n`;
    }
  }
  if (current) sections.push(current);

  if (preamble.trim() && sections[0]) {
    sections[0].markdown = `${preamble}\n${sections[0].markdown}`;
    adjustments.push(
      `writer emitted ${countWords(preamble)} words before the first heading; folded into the first section`,
    );
  }

  return sections.map((section) => ({
    heading: section.heading,
    markdown: section.markdown.trim(),
  }));
}

function shortenAtWordBoundary(
  value: string,
  limit: number,
  field: string,
  adjustments: string[],
): string {
  if (value.length <= limit) return value;
  const shortened = value
    .slice(0, limit)
    .replace(/\s+\S*$/, "")
    .replace(/[,;:\s]+$/, "");
  adjustments.push(
    `${field} shortened at a word boundary from ${value.length} to ${shortened.length} chars`,
  );
  return shortened;
}

function usageEntry(
  stage: string,
  model: string,
  usage: { inputTokens?: number; outputTokens?: number },
  latencyMs: number,
): UsageEntry {
  const tokens = {
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
  };
  return {
    stage,
    model,
    ...tokens,
    latencyMs,
    estCostUsd: estimateCost(model, tokens),
  };
}

function estimateCost(
  model: string,
  usage: { inputTokens: number | null; outputTokens: number | null },
): number | null {
  const rates = ESTIMATED_RATES[model];
  if (!rates || usage.inputTokens == null || usage.outputTokens == null) {
    return null;
  }
  return (
    (usage.inputTokens / 1_000_000) * rates.input +
    (usage.outputTokens / 1_000_000) * rates.output
  );
}

function sumCosts(entries: UsageEntry[]): number | null {
  const costs = entries
    .map((entry) => entry.estCostUsd)
    .filter((cost): cost is number => cost != null);
  return costs.length > 0
    ? costs.reduce((total, cost) => total + cost, 0)
    : null;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function assertStoryboardMatchesBrief(
  storyboard: GeneratedStoryboard,
  brief: ContentBriefInput,
  visualDirections: VisualDirection[],
): void {
  const plannedHeadings = storyboard.sections.map((section) => section.heading);
  const expectedHeadings = brief.outline.map((section) => section.heading);
  if (
    plannedHeadings.length !== expectedHeadings.length ||
    plannedHeadings.some(
      (heading, index) => heading !== expectedHeadings[index],
    )
  ) {
    throw new Error(
      "Generated storyboard changed the supplied outline headings or order",
    );
  }
  const registeredVisualIds = new Set(
    visualDirections.map((visual) => visual.id),
  );
  const unknownVisualIds = storyboard.sections
    .flatMap((section) => section.visualDirectionIds)
    .filter((visualId) => !registeredVisualIds.has(visualId));
  if (unknownVisualIds.length > 0) {
    throw new Error(
      `Generated storyboard referenced unknown visuals: ${[...new Set(unknownVisualIds)].join(", ")}`,
    );
  }
}
