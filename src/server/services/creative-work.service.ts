import {
  creativeDocumentSchema,
  emptyCreativeDocument,
} from "@/lib/creative-document";
import {
  beginDocumentRun,
  claimDocumentRun,
  latestDocumentRun,
  lockDocument,
  assertUnlocked,
  failDocumentRun,
} from "./creative-document.service";
import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, inArray, sql, eq, isNull } from "drizzle-orm";

import { env } from "@/env";
import {
  DEFAULT_CREATIVE_IMAGE_MODEL_ID,
  type CreativeImageModelId,
} from "@/lib/creative-image-models";
import { buildCreativeImagePrompt } from "@/lib/creative-image-prompt";
import type { MediaItem } from "@/server/db/content-schema";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  assistantThreadTable,
  contentPostTable,
  workflowRunTable,
  mediaAssetTable,
  productionPacketTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { R2 } from "@/server/clients/r2.client";
import {
  buildFalImageRequest,
  getFalImageResult,
  getFalImageStatus,
  isFalConfigured,
  submitFalImage,
  type FalAspectRatio,
  type FalImageSize,
} from "@/server/clients/fal.client";
import { isTrustedFalAssetUrl } from "@/server/clients/fal-request";
import {
  GEMINI_IMAGE_MODEL,
  generateGeminiImage,
  isGeminiImageConfigured,
} from "@/server/clients/gemini-image.client";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function falImageSize(aspectRatio?: string | null): FalImageSize {
  switch (aspectRatio) {
    case "1:1":
      return "square_hd";
    case "4:3":
      return "landscape_4_3";
    case "3:4":
      return "portrait_4_3";
    case "16:9":
      return "landscape_16_9";
    case "9:16":
      return "portrait_16_9";
    default:
      return "square_hd";
  }
}

function falAspectRatio(aspectRatio?: string | null): FalAspectRatio {
  switch (aspectRatio) {
    case "4:3":
    case "3:4":
    case "16:9":
    case "9:16":
      return aspectRatio;
    default:
      return "1:1";
  }
}

function outputFormat(value?: string | null): "jpeg" | "png" {
  return value?.toLowerCase() === "png" ? "png" : "jpeg";
}

type FalPayload = {
  images?: Array<{
    url?: string;
    width?: number;
    height?: number;
    content_type?: string;
  }>;
  seed?: number;
  prompt?: string;
};

function normalizeCandidates(payload: FalPayload) {
  return (payload.images ?? []).flatMap((image) =>
    image.url
      ? [
          {
            url: image.url,
            width: image.width,
            height: image.height,
            contentType: image.content_type,
            seed: payload.seed,
          },
        ]
      : [],
  );
}

function falWebhookUrl(runId: string, token: string): string | undefined {
  const base = new URL(env.NEXT_PUBLIC_BASE_URL);
  const local =
    base.hostname === "localhost" ||
    base.hostname === "127.0.0.1" ||
    base.hostname.endsWith(".local");
  if (base.protocol !== "https:" || local) return undefined;
  return new URL(
    `/api/creative/fal/webhook/${runId}?token=${encodeURIComponent(token)}`,
    base,
  ).toString();
}

export function formatProductionPacket(packet: {
  title: string;
  purpose?: string | null;
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio?: string | null;
  outputFormat?: string | null;
  suggestedTool?: string | null;
  instructions?: string | null;
}) {
  return [
    `# ${packet.title}`,
    packet.purpose ? `\n## Purpose\n${packet.purpose}` : "",
    `\n## Production prompt\n${packet.prompt}`,
    packet.negativePrompt ? `\n## Avoid\n${packet.negativePrompt}` : "",
    packet.aspectRatio ? `\nAspect ratio: ${packet.aspectRatio}` : "",
    packet.outputFormat ? `Output: ${packet.outputFormat}` : "",
    packet.suggestedTool ? `Suggested tool: ${packet.suggestedTool}` : "",
    packet.instructions ? `\n## Handoff notes\n${packet.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function createProductionPacket(input: {
  organizationId: string;
  userId: string;
  brandId: string;
  contentPostId?: string;
  threadId?: string;
  sourceMessageId?: string;
  title: string;
  purpose?: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  outputFormat?: string;
  suggestedTool?: string;
  instructions?: string;
  referenceMediaAssetIds?: string[];
}) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.organizationId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!brand) throw new Error("That brand is not available in this workspace.");

  if (input.contentPostId) {
    const content = await db.query.contentPostTable.findFirst({
      where: and(
        eq(contentPostTable.id, input.contentPostId),
        eq(contentPostTable.brandId, input.brandId),
        isNull(contentPostTable.deletedAt),
      ),
      columns: { id: true },
    });
    if (!content)
      throw new Error("That content item is not available for this brand.");
  }

  if (input.threadId) {
    const thread = await db.query.assistantThreadTable.findFirst({
      where: and(
        eq(assistantThreadTable.id, input.threadId),
        eq(assistantThreadTable.organizationId, input.organizationId),
      ),
      columns: { id: true },
    });
    if (!thread) throw new Error("That assistant session is not available.");
  }

  const [packet] = await db
    .insert(productionPacketTable)
    .values({
      organizationId: input.organizationId,
      createdBy: input.userId,
      brandId: input.brandId,
      contentPostId: input.contentPostId,
      threadId: input.threadId,
      sourceMessageId: input.sourceMessageId,
      documentType: "image",
      document: creativeDocumentSchema.parse({
        ...emptyCreativeDocument("image"),
        brief: {
          purpose: input.purpose ?? "",
          direction: input.prompt,
          constraints: [input.instructions, input.negativePrompt].filter(
            Boolean,
          ),
          assets: (input.referenceMediaAssetIds ?? []).map((assetId) => ({
            assetId,
            role: "reference",
          })),
        },
        content: {
          aspectRatio: input.aspectRatio ?? "1:1",
          composition: input.prompt,
          avoid: input.negativePrompt ?? "",
          outputFormat: input.outputFormat === "jpeg" ? "jpeg" : "png",
        },
      }),
      title: input.title,
      purpose: input.purpose,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      aspectRatio: input.aspectRatio,
      outputFormat: input.outputFormat,
      suggestedTool: input.suggestedTool,
      instructions: input.instructions,
      references: (input.referenceMediaAssetIds ?? []).map((mediaAssetId) => ({
        mediaAssetId,
        role: "reference" as const,
      })),
      status: "ready",
    })
    .returning();
  if (!packet) throw new Error("Could not save the production packet.");
  return { ...packet, copyText: formatProductionPacket(packet) };
}

export async function submitPacketForImageGeneration(input: {
  packetId: string;
  organizationId: string;
  userId: string;
  modelProfile?: CreativeImageModelId;
}) {
  const modelProfile = input.modelProfile ?? DEFAULT_CREATIVE_IMAGE_MODEL_ID;
  if (modelProfile === "flux" && !isFalConfigured)
    throw new Error("Fal image generation is not configured.");
  if (modelProfile === "google" && !isGeminiImageConfigured)
    throw new Error("Direct Google Gemini image generation is not configured.");
  const packet = await db.query.productionPacketTable.findFirst({
    where: and(
      eq(productionPacketTable.id, input.packetId),
      eq(productionPacketTable.organizationId, input.organizationId),
    ),
  });
  if (!packet) throw new Error("Production packet not found.");

  const started = await beginDocumentRun({
    ...input,
    documentId: packet.id,
    operation: "generate",
    provider: modelProfile === "google" ? "google" : "fal",
    model: modelProfile === "google" ? GEMINI_IMAGE_MODEL : "pending",
  });
  const runId = started.id;
  if (!(await claimDocumentRun(runId)))
    throw new Error("Production was cancelled before dispatch.");
  try {
    const token = randomBytes(32).toString("hex");
    const document = creativeDocumentSchema.parse(started.input.document);
    if (document.type !== "image")
      throw new Error("Select an image document for image generation.");
    packet.prompt =
      document.brief.direction +
      "\n" +
      document.content.composition +
      "\n" +
      document.content.overlayCopy;
    packet.purpose = document.brief.purpose;
    packet.instructions = document.brief.constraints.join("\n");
    packet.negativePrompt = document.content.avoid;
    packet.aspectRatio = document.content.aspectRatio;
    packet.outputFormat = document.content.outputFormat;
    packet.references = document.brief.assets.map((a) => ({
      mediaAssetId: a.assetId,
      role: a.role === "output" ? "reference" : a.role,
      note: a.note,
    }));
    const imageSize = falImageSize(packet.aspectRatio);
    const aspectRatio = falAspectRatio(packet.aspectRatio);
    const format = outputFormat(packet.outputFormat);

    // Reference assets on the packet steer generation: their public R2 URLs go
    // straight to the image-conditioned model (mixing real brand imagery into
    // the output). Without references this stays cheap text-to-image.
    const referenceAssetIds = (packet.references ?? []).map(
      (reference) => reference.mediaAssetId,
    );
    const referenceAssets = referenceAssetIds.length
      ? await db.query.mediaAssetTable.findMany({
          where: and(
            inArray(mediaAssetTable.id, referenceAssetIds),
            eq(mediaAssetTable.brandId, packet.brandId),
          ),
          columns: { id: true, url: true, kind: true },
        })
      : [];
    const referenceImageUrls = referenceAssets
      .filter((asset) => asset.kind === "image" && asset.url)
      .map((asset) => asset.url!);
    const generationPrompt = buildCreativeImagePrompt({
      prompt: packet.prompt,
      purpose: packet.purpose,
      instructions: packet.instructions,
      negativePrompt: packet.negativePrompt,
      hasReferenceImages: referenceImageUrls.length > 0,
    });

    if (modelProfile === "google") {
      const ownedReferenceImageUrls = referenceImageUrls
        .filter((url) => R2.isPublicUrl(url))
        .slice(0, 4);
      const providerInput = {
        prompt: generationPrompt,
        aspectRatio,
        imageSize: "1K",
        referenceImageUrls: ownedReferenceImageUrls,
      };

      await db
        .update(workflowRunTable)
        .set({
          input: { ...started.input, providerInput },
          prompt: generationPrompt,
        })
        .where(eq(workflowRunTable.id, runId));

      try {
        const generated = await generateGeminiImage({
          prompt: generationPrompt,
          aspectRatio,
          referenceImageUrls: ownedReferenceImageUrls,
        });
        const extension =
          generated.contentType === "image/jpeg" ? "jpg" : "png";
        const key = R2.buildKey(
          packet.brandId,
          runId,
          `candidate.${extension}`,
        );
        const url = await R2.putBuffer(
          key,
          generated.bytes,
          generated.contentType,
        );
        const [run] = await db
          .update(workflowRunTable)
          .set({
            status: "succeeded",
            candidates: [{ url, contentType: generated.contentType }],
            providerOutput: generated.providerOutput,
            completedAt: new Date(),
          })
          .where(
            and(
              eq(workflowRunTable.id, runId),
              inArray(workflowRunTable.status, ["queued", "running"]),
              sql`(${workflowRunTable.expiresAt} IS NULL OR ${workflowRunTable.expiresAt} > now())`,
            ),
          )
          .returning();
        if (!run)
          throw new Error("Could not persist the Google Gemini result.");
        return run;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Google Gemini generation failed";
        await db
          .update(workflowRunTable)
          .set({ status: "failed", error: message, completedAt: new Date() })
          .where(
            and(
              eq(workflowRunTable.id, runId),
              inArray(workflowRunTable.status, ["queued", "running"]),
              sql`(${workflowRunTable.expiresAt} IS NULL OR ${workflowRunTable.expiresAt} > now())`,
            ),
          );
        throw error;
      }
    }

    const { model, providerInput } = buildFalImageRequest({
      profile: "flux",
      prompt: generationPrompt,
      imageSize,
      aspectRatio,
      outputFormat: format,
      referenceImageUrls,
    });

    await db
      .update(workflowRunTable)
      .set({
        model,
        input: { ...started.input, providerInput },
        prompt: generationPrompt,
      })
      .where(eq(workflowRunTable.id, runId));
    await db
      .update(workflowRunTable)
      .set({ webhookTokenHash: sha256(token) })
      .where(
        and(
          eq(workflowRunTable.id, runId),
          inArray(workflowRunTable.status, ["queued", "running"]),
          sql`(${workflowRunTable.expiresAt} IS NULL OR ${workflowRunTable.expiresAt} > now())`,
        ),
      );

    try {
      const submitted = await submitFalImage({
        model,
        providerInput,
        webhookUrl: falWebhookUrl(runId, token),
      });
      const [run] = await db
        .update(workflowRunTable)
        .set({ providerRequestId: submitted.request_id })
        .where(
          and(
            eq(workflowRunTable.id, runId),
            inArray(workflowRunTable.status, ["queued", "running"]),
            sql`(${workflowRunTable.expiresAt} IS NULL OR ${workflowRunTable.expiresAt} > now())`,
          ),
        )
        .returning();
      if (!run) throw new Error("Could not persist the Fal request.");
      return run;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Fal submission failed";
      await db
        .update(workflowRunTable)
        .set({ status: "failed", error: message, completedAt: new Date() })
        .where(
          and(
            eq(workflowRunTable.id, runId),
            inArray(workflowRunTable.status, ["queued", "running"]),
            sql`(${workflowRunTable.expiresAt} IS NULL OR ${workflowRunTable.expiresAt} > now())`,
          ),
        );
      throw error;
    }
  } catch (error) {
    await failDocumentRun(runId, error);
    throw error;
  }
}

export async function refreshCreativeRun(input: {
  runId: string;
  organizationId: string;
}) {
  let run = await db.query.workflowRunTable.findFirst({
    where: and(
      eq(workflowRunTable.id, input.runId),
      eq(workflowRunTable.organizationId, input.organizationId),
    ),
  });
  if (!run) throw new Error("Creative run not found.");
  if (run.packetId) {
    await latestDocumentRun(run.packetId, input.organizationId);
    run = (await db.query.workflowRunTable.findFirst({
      where: eq(workflowRunTable.id, run.id),
    }))!;
  }
  if (run.provider !== "fal" || !run.providerRequestId) return run;
  if (["succeeded", "failed", "cancelled"].includes(run.status)) return run;

  const status = await getFalImageStatus(run.model, run.providerRequestId);
  if (status.status !== "COMPLETED") {
    const [updated] = await db
      .update(workflowRunTable)
      .set({
        status: "running",
      })
      .where(
        and(
          eq(workflowRunTable.id, run.id),
          inArray(workflowRunTable.status, ["queued", "running"]),
          sql`(${workflowRunTable.expiresAt} IS NULL OR ${workflowRunTable.expiresAt} > now())`,
        ),
      )
      .returning();
    return updated ?? run;
  }

  const result = await getFalImageResult(run.model, run.providerRequestId);
  const payload = result.data as FalPayload;
  const candidates = normalizeCandidates(payload);
  const [updated] = await db
    .update(workflowRunTable)
    .set({
      status: candidates.length ? "succeeded" : "failed",
      candidates,
      providerOutput: payload,
      error: candidates.length ? null : "Fal returned no image candidates.",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRunTable.id, run.id),
        inArray(workflowRunTable.status, ["queued", "running"]),
        sql`(${workflowRunTable.expiresAt} IS NULL OR ${workflowRunTable.expiresAt} > now())`,
      ),
    )
    .returning();
  return updated ?? run;
}

export async function applyFalWebhook(input: {
  runId: string;
  token: string;
  requestId: string;
  status: "OK" | "ERROR";
  payload?: FalPayload;
  error?: string;
}) {
  const run = await db.query.workflowRunTable.findFirst({
    where: eq(workflowRunTable.id, input.runId),
  });
  if (
    !run?.webhookTokenHash ||
    sha256(input.token) !== run.webhookTokenHash ||
    (run.providerRequestId && run.providerRequestId !== input.requestId)
  ) {
    return null;
  }
  if (["succeeded", "failed", "cancelled"].includes(run.status)) return run;

  const candidates =
    input.status === "OK" ? normalizeCandidates(input.payload ?? {}) : [];
  const [updated] = await db
    .update(workflowRunTable)
    .set({
      providerRequestId: run.providerRequestId ?? input.requestId,
      status:
        input.status === "OK" && candidates.length ? "succeeded" : "failed",
      candidates,
      providerOutput: input.payload ?? {},
      error:
        input.status === "ERROR"
          ? (input.error ?? "Fal generation failed.")
          : candidates.length
            ? null
            : "Fal returned no image candidates.",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRunTable.id, run.id),
        inArray(workflowRunTable.status, ["queued", "running"]),
        sql`(${workflowRunTable.expiresAt} IS NULL OR ${workflowRunTable.expiresAt} > now())`,
      ),
    )
    .returning();
  return updated ?? run;
}

function assertCreativeCandidateUrl(provider: string, value: string) {
  const trusted =
    (provider === "fal" && isTrustedFalAssetUrl(value)) ||
    (provider === "google" && R2.isPublicUrl(value));
  if (!trusted)
    throw new Error("The generated image URL is not a trusted provider asset.");
}

export async function acceptCreativeCandidate(input: {
  runId: string;
  candidateIndex: number;
  organizationId: string;
  userId: string;
}) {
  const run = await db.query.workflowRunTable.findFirst({
    where: and(
      eq(workflowRunTable.id, input.runId),
      eq(workflowRunTable.organizationId, input.organizationId),
    ),
    with: { packet: true },
  });
  if (run?.status !== "succeeded")
    throw new Error("Creative run is not ready.");
  if (run.acceptedMediaAssetId)
    return { run, mediaAssetId: run.acceptedMediaAssetId };
  const candidate = run.candidates[input.candidateIndex];
  if (!candidate) throw new Error("Generated image candidate not found.");
  assertCreativeCandidateUrl(run.provider, candidate.url);

  const extension = candidate.contentType === "image/png" ? "png" : "jpg";
  const filename = `${run.packet?.title ?? "generated-image"}.${extension}`
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-");
  const mediaId = createId("media");
  const r2Key = R2.buildKey(run.brandId, mediaId, filename);
  const r2Url = await R2.putFromUrl(r2Key, candidate.url);

  await withTransaction(async (tx) => {
    if (run.packetId) {
      const packet = await lockDocument(tx, run.packetId, input.organizationId);
      await assertUnlocked(tx, packet.id);
      const current = creativeDocumentSchema.parse(packet.document);
      if (current.type !== "image")
        throw new Error("Expected an image document.");
      await tx
        .update(productionPacketTable)
        .set({
          document: {
            ...current,
            content: { ...current.content, selectedAssetId: mediaId },
          },
          updatedAt: new Date(),
        })
        .where(eq(productionPacketTable.id, packet.id));
    }
    const [fresh] = await tx
      .select()
      .from(workflowRunTable)
      .where(eq(workflowRunTable.id, run.id))
      .for("update");
    if (fresh?.acceptedMediaAssetId)
      throw new Error(
        "This candidate was already accepted. Refresh to see the saved image.",
      );
    await tx.insert(mediaAssetTable).values({
      id: mediaId,
      brandId: run.brandId,
      uploadedBy: input.userId,
      provider: "r2",
      kind: "image",
      status: "ready",
      title: run.packet?.title ?? "Generated image",
      filename,
      mimeType:
        candidate.contentType ??
        `image/${extension === "jpg" ? "jpeg" : extension}`,
      r2Key,
      url: r2Url,
      width: candidate.width,
      height: candidate.height,
      metadata: {
        generation: {
          provider: run.provider,
          runId: run.id,
          requestId: run.providerRequestId,
          model: run.model,
          prompt: run.prompt,
          packetId: run.packetId,
          sourceUrl: candidate.url,
        },
      },
    });

    if (run.contentPostId) {
      const [content] = await tx
        .select({ media: contentPostTable.media })
        .from(contentPostTable)
        .where(eq(contentPostTable.id, run.contentPostId))
        .for("update");
      const item: MediaItem = {
        url: r2Url,
        type: "image",
        assetId: mediaId,
        width: candidate.width,
        height: candidate.height,
      };
      const media = [...(content?.media ?? [])].filter(
        (existing) => existing.assetId !== mediaId,
      );
      media.push(item);
      await tx
        .update(contentPostTable)
        .set({ media })
        .where(eq(contentPostTable.id, run.contentPostId));
    }

    await tx
      .update(workflowRunTable)
      .set({ acceptedMediaAssetId: mediaId })
      .where(eq(workflowRunTable.id, run.id));
  });

  const accepted = await db.query.workflowRunTable.findFirst({
    where: eq(workflowRunTable.id, run.id),
  });
  return { run: accepted ?? run, mediaAssetId: mediaId, url: r2Url };
}

export const CreativeWorkService = {
  createProductionPacket,
  submitPacketForImageGeneration,
  refreshCreativeRun,
  applyFalWebhook,
  acceptCreativeCandidate,
};
