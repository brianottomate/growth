import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import type {
  ContentBriefGroundingContext,
  ContentBriefInput,
} from "./contract";
import type { GeneratedArticle } from "./checks";
import { EDITORIAL_RULES } from "./editorial";

// The independent editorial evaluator: a separate model pass that never saw
// the generation, judging the article against the brief and grounding. Its
// AI-pattern rubric is distilled from the Humanizer workflow the blog
// workbench handoff validated: aphoristic conclusions, manufactured
// punchlines, staccato drama, negative parallelism, forced triads, generic
// signposting, filler conclusions.

export const EVALUATOR_VERSION = "editorial-evaluator/v5";
export const EVALUATOR_MODEL = "claude-sonnet-5";

const EvaluatorComment = z.object({
  sectionHeading: z
    .string()
    .describe("The exact heading of the section the comment anchors to"),
  excerpt: z.string().describe("The exact text being flagged"),
  kind: z.enum([
    "fabrication",
    "grounding",
    "ai_pattern",
    "voice",
    "structure",
    "links",
  ]),
  note: z.string(),
  severity: z.enum(["minor", "major"]),
});

const EvaluatorReport = z.object({
  comments: z.array(EvaluatorComment),
  strengths: z.array(z.string()).describe("What genuinely works, briefly"),
  summary: z.string(),
  verdict: z.enum(["publish_candidate", "revise", "reject"]),
});

export type EvaluatorReceipt = {
  evaluatorVersion: string;
  model: string;
  verdict: z.infer<typeof EvaluatorReport>["verdict"];
  summary: string;
  strengths: string[];
  comments: z.infer<typeof EvaluatorComment>[];
  usage: { inputTokens: number | null; outputTokens: number | null };
  latencyMs: number;
};

const EVALUATOR_SYSTEM = [
  "You are the independent editor for a long-form article. Judge it for the audience and purpose in its brief, whether traveler guidance or an operator announcement.",
  "You did not write it. Judge it against the brief and the grounding facts",
  "provided, on these axes:",
  "",
  "1. Factual grounding: any specific claim (numbers above all) not in the",
  "   grounding facts is fabrication. Flag every one, severity major.",
  "2. Brief adherence: does each section do what its outline heading and",
  "   key points demand, leading with a direct citable answer?",
  "3. AI-writing patterns, flag each occurrence: aphoristic closing lines,",
  "   manufactured punchlines, staccato drama (chains of fragment",
  "   sentences), repeated negative parallelism ('not X, Y'), forced groups",
  "   of three, generic signposting ('let's dive in', 'when it comes to'),",
  "   and filler conclusions that restate the page.",
  "4. Voice: plain, lived-in, specific; no cliché unless earned by detail;",
  "   no em dashes.",
  "5. Links and promotion: source and property links only where they help,",
  "   with real hrefs; the page should read as operator knowledge, not a",
  "   search-engine-first roundup.",
  "",
  "Anchor every comment to its section heading with an exact excerpt.",
  "Also judge these editorial requirements; flag violations using the existing comment kinds:",
  EDITORIAL_RULES,
  "Verdict: publish_candidate only when no major comment exists.",
].join("\n");

export async function evaluateArticle(
  article: GeneratedArticle,
  brief: ContentBriefInput,
  context: ContentBriefGroundingContext,
): Promise<EvaluatorReceipt> {
  const startedAt = Date.now();
  const { output, usage } = await generateText({
    model: anthropic(EVALUATOR_MODEL),
    output: Output.object({ schema: EvaluatorReport }),
    maxOutputTokens: 16_000,
    system: EVALUATOR_SYSTEM,
    prompt: [
      "# Brief",
      JSON.stringify(brief, null, 2),
      "",
      "# Grounding facts (the ONLY permitted source of specific claims)",
      JSON.stringify(context, null, 2),
      "",
      "# Article under review",
      `metaTitle: ${article.metaTitle}`,
      `metaDescription: ${article.metaDescription}`,
      "",
      ...article.sections.map(
        (section) => `## ${section.heading}\n${section.markdown}`,
      ),
    ].join("\n"),
  });

  return {
    evaluatorVersion: EVALUATOR_VERSION,
    model: EVALUATOR_MODEL,
    verdict: output.verdict,
    summary: output.summary,
    strengths: output.strengths,
    comments: output.comments,
    usage: {
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
    },
    latencyMs: Date.now() - startedAt,
  };
}
