import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import { caseStudyChange, ratio } from "@/lib/performance-report";
import { CLAUDE_MODELS } from "@/server/clients/claude.client";
import {
  getReportWorkspace,
  saveReportDraft,
} from "@/server/services/performance-report.service";

const lead = z.object({
  headline: z
    .string()
    .describe(
      "At most six words, sentence case, no numbers, ending with a period.",
    ),
  summary: z
    .string()
    .describe(
      "Two sentences. Name the start date and the strongest changes. `**bold**` only.",
    ),
  featured: z
    .array(z.number().int())
    .describe("Indexes of the two or three figures to show large."),
});

const SYSTEM = `You write the opening of a sales case study for Performance by Wander, a paid-media program for vacation rental operators with their own booking website. Readers are other operators deciding whether to join.
Lead with what an operator cares about most, not the largest percentage: booking value first, then the value of each booking, then demand such as visits. Feature two or three figures that each say something different; never two that measure nearly the same thing, such as a median and an average.
The headline is a short outcome in sentence case with no numbers, like "Higher-value direct bookings."
In the summary, write changes as plain percentages without a plus sign ("rose 32%"), using only the figures supplied. Never state money amounts, booking counts or any number not supplied, apart from dates.
"Direct website" figures cover the whole website, whatever brought each visit: describe them as what happened after launch, never as caused by the ads. "Paid ads" figures are what the ad platform attributes to the ads.
Plain, specific language. No dashes as punctuation, no superlatives, no promises.`;

/** Percent changes in the text must be ones the case study shows. */
function unsupported(text: string, allowed: Set<string>) {
  return [...text.matchAll(/[+−-]?\d+(?:\.\d+)?\s?(?:%|pts)/g)]
    .map((match) => match[0].replace(/^-/, "−").replace(/^(\d)/, "+$1"))
    .filter((figure) => !allowed.has(figure));
}

/**
 * Writes the headline, summary and featured figures from the figures stored
 * on the case study. On demand only; the result replaces the previous lead.
 */
export async function writeCaseStudyLead(
  orgId: string,
  input: { brandId: string; reportId: string },
) {
  const workspace = await getReportWorkspace(orgId, input.brandId);
  const report = workspace.reports.find((row) => row.id === input.reportId);
  const study = report?.content.caseStudy;
  if (!report || !study) throw new Error("Case study not found");

  const measures = study.comparison.measures;
  const changes = measures.map(caseStudyChange);
  const allowed = new Set(changes);
  const prompt = JSON.stringify({
    client: workspace.clientName,
    launched: study.comparison.after.startDate,
    comparison: `${study.comparison.before.startDate} to ${study.comparison.before.endDate} versus ${study.comparison.after.startDate} to ${study.comparison.after.endDate}`,
    figures: measures.map((measure, index) => ({
      index,
      label: measure.label,
      scope: measure.scope === "paid" ? "Paid ads" : "Direct website",
      change: changes[index],
      note: measure.note,
    })),
    story: study.sections.map((section) => section.body),
    creative: study.showCreative
      ? report.content.highlights.map((ad) => ({
          title: ad.title,
          format: ad.format,
          clickThrough: ratio(ad.linkClicks, ad.impressions),
        }))
      : [],
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const { output } = await generateText({
      model: anthropic(CLAUDE_MODELS.SONNET_5),
      system: SYSTEM,
      prompt,
      output: Output.object({ schema: lead }),
    });
    const featured = [...new Set(output.featured)].filter(
      (index) => measures[index] !== undefined,
    );
    if (
      featured.length === 0 ||
      /\d/.test(output.headline) ||
      unsupported(`${output.headline} ${output.summary}`, allowed).length
    )
      continue;
    return saveReportDraft(orgId, {
      brandId: input.brandId,
      id: report.id,
      cycleId: report.cycleId,
      content: {
        ...report.content,
        caseStudy: {
          ...study,
          headline: output.headline.trim(),
          summary: output.summary.trim(),
          comparison: {
            ...study.comparison,
            measures: measures.map((measure, index) => ({
              ...measure,
              featured: featured.includes(index),
            })),
          },
        },
      },
    });
  }
  throw new Error(
    "Could not write a lead that uses only the case study's figures. Try again.",
  );
}
