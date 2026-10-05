import { BLOG_FORMAT_RULES } from "@/lib/blog-format";
import { prepareDatoMarkdown } from "@/lib/dato-markdown";
import { db } from "@/server/db";
import { mediaAssetTable } from "@/server/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  creativeDocumentSchema,
  videoContentSchema,
} from "@/lib/creative-document";
import {
  claimDocumentRun,
  failDocumentRun,
  finishDocumentRun,
} from "./creative-document.service";
import { executeBlogGoldenRun } from "./blog-workbench/run";
import {
  SHARED_BLOG_PROMPT,
  BLOG_PROMPT_TEMPLATES,
} from "./blog-workbench/templates";
import { EDITORIAL_RULES } from "./blog-workbench/editorial";
import type { ContentBriefGroundingContext } from "./blog-workbench/contract";

export async function runCreativeWriting(runId: string) {
  const run = await claimDocumentRun(runId);
  if (!run) return;
  try {
    const document = creativeDocumentSchema.parse(run.input.document);
    if (document.type === "video") {
      const { output, usage } = await generateText({
        model: anthropic(run.model),
        output: Output.object({ schema: videoContentSchema }),
        system:
          "Prepare a video script and production plan from the supplied brief. Only use supplied facts and asset IDs. Do not claim footage was generated. Each scene needs a stable unique ID, duration, direction, narration and overlay copy. Preserve selected assets when revising.",
        prompt: JSON.stringify(document),
      });
      await finishDocumentRun(
        run.id,
        { ...document, content: output },
        {
          usage,
          deliverable:
            "Video production plan; footage generation is a separate operation.",
        },
      );
      return;
    }
    if (document.type !== "article")
      throw new Error(
        "Use the email writer or image adapter for this document type.",
      );
    if (!document.brief.facts.length)
      throw new Error(
        "Add verified facts and sources to the brief before writing the article.",
      );
    const assetIds = document.brief.assets.map((a) => a.assetId);
    const images = assetIds.length
      ? await db
          .select({ url: mediaAssetTable.url, title: mediaAssetTable.title })
          .from(mediaAssetTable)
          .where(
            and(
              inArray(mediaAssetTable.id, assetIds),
              eq(mediaAssetTable.brandId, run.brandId),
              eq(mediaAssetTable.kind, "image"),
              eq(mediaAssetTable.status, "ready"),
              isNull(mediaAssetTable.deletedAt),
            ),
          )
      : [];
    const { output: plan } = await generateText({
      model: anthropic("claude-sonnet-5"),
      output: Output.object({
        schema: z.object({
          title: z.string(),
          targetQuery: z.string(),
          outline: z
            .array(
              z.object({
                heading: z.string(),
                key_points: z.array(z.string()).min(1),
              }),
            )
            .min(4)
            .max(8),
          template: z.enum([
            "timing",
            "destination",
            "itinerary",
            "activities",
            "family",
            "groups",
            "amenities",
            "property",
            "announcement",
          ]),
        }),
      }),
      system:
        "Plan a blog article from the supplied creative document. Choose an appropriate editorial template. Only use facts supplied in its brief; a campaign proposal is not a shipped product claim. Plan four to eight useful sections without inventing evidence." +
        "\n" +
        BLOG_FORMAT_RULES,
      prompt: JSON.stringify(document),
    });
    const facts = document.brief.facts
      .map((f) => `${f.claim}${f.sourceUrl ? ` (source: ${f.sourceUrl})` : ""}`)
      .join("\n");
    const context: ContentBriefGroundingContext = {
      sourceUrls: [
        ...document.brief.facts.flatMap((f) =>
          f.sourceUrl ? [f.sourceUrl] : [],
        ),
        ...images.flatMap((image) => (image.url ? [image.url] : [])),
      ],
      businessName: z.string().catch("Wander").parse(run.input.brandName),
      summary: facts,
      locations: [],
      amenities: [],
      activities: [],
      targetAudience: document.brief.audience,
      distinctiveFeatures: [],
      typicalPriceRange: null,
      voice: z.string().catch("").parse(run.input.brandVoice),
      properties: [],
    };
    const record = await executeBlogGoldenRun({
      persist: false,
      visualDirections: [],
      missingInputs: [],
      response: {
        run_id: run.id,
        target_domain: "wander.com",
        status: "ready",
        brief_id: run.packetId!,
        error: null,
        brief: {
          brief_id: run.packetId!,
          context_package_id: run.id,
          measurement_id: run.id,
          target_query: plan.targetQuery,
          guest_intent: document.brief.audience || document.brief.purpose,
          working_title: plan.title,
          summary: document.brief.purpose + "\n" + document.brief.direction,
          outline: plan.outline,
          entities_to_cover: [],
          recommended_page_kind: plan.template,
          suggested_word_count: 900,
        },
      },
      grounding: {
        version: "production-brief/v1",
        provenance:
          "Operator-reviewed document brief, captured when this run started.",
        targetDomain: "wander.com",
        crawledUrls: document.brief.facts.flatMap((f) =>
          f.sourceUrl ? [f.sourceUrl] : [],
        ),
        derivedAt: run.createdAt.toISOString(),
        model: "none",
        usage: { inputTokens: null, outputTokens: null },
        context,
      },
      prompt: [
        SHARED_BLOG_PROMPT,
        BLOG_PROMPT_TEMPLATES.find((t) => t.id === plan.template)?.prompt,
        EDITORIAL_RULES,
        BLOG_FORMAT_RULES,
        "Use the concrete input below to resolve template placeholders. This may be an announcement for operators, not a travel guide. Never force traveler advice into an announcement.",
        JSON.stringify({
          title: plan.title,
          outline: plan.outline,
          brief: document.brief,
          facts,
          availableLibraryImages: images,
          voice: context.voice,
        }),
      ].join("\n\n"),
    });
    const article = record.stages.article;
    const failed = record.receipts.deterministic.filter(
      (c) => c.status !== "passed",
    );
    const bodyMarkdown = article.sections
      .map((s) => `## ${s.heading}\n\n${s.markdown}`)
      .join("\n\n");
    const formatFindings: string[] = [];
    try {
      const prepared = await prepareDatoMarkdown(bodyMarkdown);
      if (
        prepared.blocks.some(
          (b) =>
            b.kind === "image" && !images.some((image) => image.url === b.url),
        )
      )
        formatFindings.push(
          "Replace an unverified inline image before exporting.",
        );
    } catch (error) {
      formatFindings.push(
        error instanceof Error ? error.message : "Unsupported blog formatting",
      );
    }
    const { datoBody: _oldBody, ...content } = document.content;
    await finishDocumentRun(
      run.id,
      {
        ...document,
        content: {
          ...content,
          title: plan.title,
          slug:
            content.slug ||
            plan.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, ""),
          description: article.metaDescription,
          bodyMarkdown,
          review: {
            verdict:
              failed.length || formatFindings.length
                ? "needs_review"
                : record.receipts.evaluator.verdict,
            findings: [
              ...formatFindings,
              ...failed.map((c) => c.summary),
              ...record.receipts.evaluator.comments.map((c) => c.note),
            ],
          },
        },
      },
      {
        storyboard: record.storyboard,
        receipts: record.receipts,
        usage: record.usage,
      },
    );
  } catch (error) {
    await failDocumentRun(runId, error);
    throw error;
  }
}
