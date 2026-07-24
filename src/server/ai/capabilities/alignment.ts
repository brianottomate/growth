import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import { computeAlignmentOverview } from "@/server/services/ads-alignment.service";
import { computeAudienceAlignment } from "@/server/services/audience-alignment.service";
import { orgBrandIds } from "./brands";
import { growthAction } from "./types";

const MODEL = "claude-sonnet-5";

// The model reasons over grounding we compute deterministically (DB intent +
// Zernio-synced reality) rather than pulling the platforms itself — grounding
// stays trustworthy, the LLM does the judgement + phrasing + prioritization.
const DiagnosisSchema = z.object({
  summary: z
    .string()
    .describe("2-3 sentence plain-language state of paid-strategy alignment."),
  findings: z
    .array(
      z.object({
        severity: z
          .enum(["high", "medium", "low"])
          .describe("high = intended spend/audience not running at all."),
        area: z
          .enum(["channel-coverage", "budget", "dates", "audience", "linkage"])
          .describe("Which dimension of intent-vs-actual this concerns."),
        entity: z
          .string()
          .describe("Initiative or audience-target name the finding is about."),
        finding: z.string().describe("What is misaligned, stated concretely."),
        suggestedUpdate: z
          .string()
          .describe(
            "The concrete next action — a link/unlink in Growth, a platform change, or an intent edit. Never claim it was done.",
          ),
      }),
    )
    .describe("Ranked most-severe first. Empty if everything is aligned."),
});

export type AlignmentDiagnosis = z.infer<typeof DiagnosisSchema>;

const SYSTEM_PROMPT = `You are the Wander growth team's paid-strategy alignment analyst.

You are given GROUNDING: the strategy layer (initiatives with intended channels/budget/dates, audience targets with intended channels) diffed against platform reality (campaigns and audiences synced from the ad platforms via Zernio).

Your job: identify where INTENT and ACTUAL diverge and suggest what to update. Rules:
- Only use the grounding provided. Do not invent campaigns, spend, or audiences.
- Rank findings by business impact: an intended channel with no live campaign, or a must-have audience with zero live coverage, is high severity. Unlinked-but-plausible campaigns or minor date drift are low.
- suggestedUpdate must be a concrete action the operator can take (link campaign X to initiative Y in Growth; launch a Google campaign for initiative Z; mark audience target as retired; correct the intended channels). NEVER state that you performed an action — you only diagnose and suggest.
- If grounding shows full alignment, return an empty findings array and say so in the summary.`;

export const diagnoseAlignment = growthAction({
  description:
    "Diagnose paid-strategy alignment: compares the growth strategy layer (initiative intended channels/budget/dates + audience targets) against platform reality (campaigns/audiences synced via Zernio) and returns ranked misalignments with concrete suggested updates. Use for 'are our ads running what we planned', 'what's misaligned', 'what should we update on paid'. Read-only — it suggests, it does not change anything.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const brandIds = await orgBrandIds(ctx.orgId);
    const [campaigns, audiences] = await Promise.all([
      computeAlignmentOverview(brandIds),
      computeAudienceAlignment(brandIds),
    ]);

    const grounding = { campaigns, audiences };

    // Nothing to reason about — return the (empty) grounding without a model call.
    if (campaigns.length === 0 && audiences.length === 0) {
      return {
        grounding,
        diagnosis: {
          summary:
            "No initiatives or audience targets with intent to compare against yet.",
          findings: [],
        } satisfies AlignmentDiagnosis,
      };
    }

    try {
      const { output } = await generateText({
        model: anthropic(MODEL),
        output: Output.object({
          name: "alignment_diagnosis",
          description:
            "Ranked intent-vs-actual misalignments with suggested updates",
          schema: DiagnosisSchema,
        }),
        system: SYSTEM_PROMPT,
        prompt: JSON.stringify(grounding),
        temperature: 0,
      });
      return { grounding, diagnosis: output };
    } catch (error) {
      console.error("[diagnoseAlignment] AI call failed", error);
      // Grounding is still useful on its own — return it without the narrative.
      return {
        grounding,
        diagnosis: {
          summary:
            "Alignment grounding computed, but the analysis model call failed — inspect the raw grounding.",
          findings: [],
        } satisfies AlignmentDiagnosis,
      };
    }
  },
});
