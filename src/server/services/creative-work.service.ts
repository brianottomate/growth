import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { env } from "@/env";
import type { MediaItem } from "@/server/db/content-schema";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  assistantThreadTable,
  contentPostTable,
  creativeRunTable,
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
  type FalImageSize,
} from "@/server/clients/fal.client";

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

export async function submitPacketToFal(input: {
  packetId: string;
  organizationId: string;
  userId: string;
}) {
  if (!isFalConfigured)
    throw new Error("Fal image generation is not configured.");
  const packet = await db.query.productionPacketTable.findFirst({
    where: and(
      eq(productionPacketTable.id, input.packetId),
      eq(productionPacketTable.organizationId, input.organizationId),
    ),
  });
  if (!packet) throw new Error("Production packet not found.");

  const token = randomBytes(32).toString("hex");
  const runId = createId("crun");
  const imageSize = falImageSize(packet.aspectRatio);
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

  const { model, providerInput } = buildFalImageRequest({
    prompt: packet.prompt,
    imageSize,
    outputFormat: format,
    referenceImageUrls,
  });

  await db.insert(creativeRunTable).values({
    id: runId,
    organizationId: input.organizationId,
    brandId: packet.brandId,
    contentPostId: packet.contentPostId,
    threadId: packet.threadId,
    packetId: packet.id,
    provider: "fal",
    kind: "image",
    model,
    prompt: packet.prompt,
    input: providerInput,
    webhookTokenHash: sha256(token),
    status: "queued",
    createdBy: input.userId,
  });

  try {
    const submitted = await submitFalImage({
      model,
      providerInput,
      webhookUrl: falWebhookUrl(runId, token),
    });
    const [run] = await db
      .update(creativeRunTable)
      .set({ providerRequestId: submitted.request_id })
      .where(eq(creativeRunTable.id, runId))
      .returning();
    if (!run) throw new Error("Could not persist the Fal request.");
    return run;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fal submission failed";
    await db
      .update(creativeRunTable)
      .set({ status: "error", error: message, completedAt: new Date() })
      .where(eq(creativeRunTable.id, runId));
    throw error;
  }
}

export async function refreshCreativeRun(input: {
  runId: string;
  organizationId: string;
}) {
  const run = await db.query.creativeRunTable.findFirst({
    where: and(
      eq(creativeRunTable.id, input.runId),
      eq(creativeRunTable.organizationId, input.organizationId),
    ),
  });
  if (!run) throw new Error("Creative run not found.");
  if (run.provider !== "fal" || !run.providerRequestId) return run;
  if (["ready", "error", "cancelled"].includes(run.status)) return run;

  const status = await getFalImageStatus(run.model, run.providerRequestId);
  if (status.status !== "COMPLETED") {
    const [updated] = await db
      .update(creativeRunTable)
      .set({
        status: status.status === "IN_PROGRESS" ? "processing" : "queued",
      })
      .where(eq(creativeRunTable.id, run.id))
      .returning();
    return updated ?? run;
  }

  const result = await getFalImageResult(run.model, run.providerRequestId);
  const payload = result.data as FalPayload;
  const candidates = normalizeCandidates(payload);
  const [updated] = await db
    .update(creativeRunTable)
    .set({
      status: candidates.length ? "ready" : "error",
      candidates,
      providerOutput: payload,
      error: candidates.length ? null : "Fal returned no image candidates.",
      completedAt: new Date(),
    })
    .where(eq(creativeRunTable.id, run.id))
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
  const run = await db.query.creativeRunTable.findFirst({
    where: eq(creativeRunTable.id, input.runId),
  });
  if (
    !run?.webhookTokenHash ||
    sha256(input.token) !== run.webhookTokenHash ||
    (run.providerRequestId && run.providerRequestId !== input.requestId)
  ) {
    return null;
  }
  if (["ready", "error", "cancelled"].includes(run.status)) return run;

  const candidates =
    input.status === "OK" ? normalizeCandidates(input.payload ?? {}) : [];
  const [updated] = await db
    .update(creativeRunTable)
    .set({
      providerRequestId: run.providerRequestId ?? input.requestId,
      status: input.status === "OK" && candidates.length ? "ready" : "error",
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
    .where(eq(creativeRunTable.id, run.id))
    .returning();
  return updated ?? run;
}

function assertFalCandidateUrl(value: string) {
  const url = new URL(value);
  const allowed =
    url.protocol === "https:" &&
    (url.hostname === "fal.media" ||
      url.hostname.endsWith(".fal.media") ||
      url.hostname.endsWith(".fal.ai"));
  if (!allowed)
    throw new Error("The generated image URL is not a trusted Fal asset.");
  return url;
}

export async function acceptCreativeCandidate(input: {
  runId: string;
  candidateIndex: number;
  organizationId: string;
  userId: string;
}) {
  const run = await db.query.creativeRunTable.findFirst({
    where: and(
      eq(creativeRunTable.id, input.runId),
      eq(creativeRunTable.organizationId, input.organizationId),
    ),
    with: { packet: true },
  });
  if (run?.status !== "ready") throw new Error("Creative run is not ready.");
  if (run.acceptedMediaAssetId)
    return { run, mediaAssetId: run.acceptedMediaAssetId };
  const candidate = run.candidates[input.candidateIndex];
  if (!candidate) throw new Error("Generated image candidate not found.");
  assertFalCandidateUrl(candidate.url);

  const extension = candidate.contentType === "image/png" ? "png" : "jpg";
  const filename = `${run.packet?.title ?? "generated-image"}.${extension}`
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-");
  const mediaId = createId("media");
  const r2Key = R2.buildKey(run.brandId, mediaId, filename);
  const r2Url = await R2.putFromUrl(r2Key, candidate.url);

  await withTransaction(async (tx) => {
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
      const content = await tx.query.contentPostTable.findFirst({
        where: eq(contentPostTable.id, run.contentPostId),
        columns: { media: true },
      });
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
      .update(creativeRunTable)
      .set({ acceptedMediaAssetId: mediaId })
      .where(eq(creativeRunTable.id, run.id));
  });

  const accepted = await db.query.creativeRunTable.findFirst({
    where: eq(creativeRunTable.id, run.id),
  });
  return { run: accepted ?? run, mediaAssetId: mediaId, url: r2Url };
}

export const CreativeWorkService = {
  createProductionPacket,
  submitPacketToFal,
  refreshCreativeRun,
  applyFalWebhook,
  acceptCreativeCandidate,
};
