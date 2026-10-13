import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db, withTransaction } from "@/server/db";
import {
  mediaAssetTable,
  mediaAssetTagTable,
  mediaTagTable,
} from "@/server/db/schema";
import { transcribeVideoUrl } from "./audio-transcription.service";
import {
  analyzeMediaImage,
  analyzeMediaVideo,
  videoEvidence,
  type MediaAnalysis,
  type MediaVideoAnalysis,
} from "./media-analysis.service";

const TRANSCRIPTION_BUDGET_MS = 50_000;

/**
 * Shared persistence workflow used by the library UI, chat, and MCP.
 *
 * Images and videos land in the same place — title, alt, managed tags on the
 * row, the full analysis under `metadata.aiAnalysis` — so a clip files and
 * searches exactly like a still. A video is read from the storyboard cut at
 * upload when there is one, and from its poster frame when there is not; the
 * result records which, because a one-frame read is a weaker claim.
 */
export async function analyzeStoredMediaAsset(input: {
  mediaId: string;
  brandName: string;
  steer?: string;
}): Promise<MediaAnalysis | MediaVideoAnalysis> {
  const asset = await db.query.mediaAssetTable.findFirst({
    where: eq(mediaAssetTable.id, input.mediaId),
  });
  if (!asset?.url || (asset.kind !== "image" && asset.kind !== "video")) {
    throw new Error("Only ready images and videos can be analyzed.");
  }
  const managedTags = await db.query.mediaTagTable.findMany({
    where: eq(mediaTagTable.brandId, asset.brandId),
    orderBy: [asc(mediaTagTable.name)],
  });
  const tags = managedTags.map((tag) => ({
    name: tag.name,
    description: tag.description,
  }));

  let analysis: MediaAnalysis | MediaVideoAnalysis;
  if (asset.kind === "image") {
    analysis = await analyzeMediaImage({
      url: asset.url,
      brandName: input.brandName,
      tags,
      steer: input.steer,
    });
  } else {
    const evidence = videoEvidence(asset);
    if (!evidence) {
      throw new Error(
        "This video has no frames to look at: no storyboard was cut and it has no poster. Re-upload it on /app/media, which captures both.",
      );
    }
    // Transcription is worth having and not worth failing over: Whisper caps
    // at 25 MB, a silent clip is a legitimate clip, and a stalled upstream
    // should cost the transcript, not the analysis behind it.
    let transcript: MediaVideoAnalysis["transcript"] = null;
    let transcriptError: string | undefined;
    try {
      const result = await Promise.race([
        // The brand's own name is the noun most often said and least often
        // known to the model.
        transcribeVideoUrl(asset.url, { vocabulary: [input.brandName] }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Transcription took longer than 50 s.")),
            TRANSCRIPTION_BUDGET_MS,
          ),
        ),
      ]);
      transcript = result.text.trim()
        ? { text: result.text, language: result.language }
        : null;
    } catch (error) {
      transcriptError =
        error instanceof Error ? error.message : "Transcription failed.";
    }
    analysis = await analyzeMediaVideo({
      imageUrls: evidence.imageUrls,
      evidence: evidence.source,
      transcript,
      transcriptError,
      durationSeconds: asset.duration,
      brandName: input.brandName,
      tags,
      steer: input.steer,
    });
  }

  const tagIdByName = new Map(
    managedTags.map((tag) => [tag.name.toLowerCase(), tag.id] as const),
  );
  const aiTagIds = analysis.tags
    .map((name) => tagIdByName.get(name.toLowerCase()))
    .filter((id): id is string => Boolean(id));
  await withTransaction(async (tx) => {
    await tx
      .delete(mediaAssetTagTable)
      .where(
        and(
          eq(mediaAssetTagTable.mediaAssetId, asset.id),
          eq(mediaAssetTagTable.source, "ai"),
        ),
      );
    if (aiTagIds.length > 0) {
      await tx.insert(mediaAssetTagTable).values(
        aiTagIds.map((tagId) => ({
          mediaAssetId: asset.id,
          tagId,
          source: "ai" as const,
        })),
      );
    }
    await tx
      .update(mediaAssetTable)
      .set({
        title: asset.title || analysis.name,
        alt: asset.alt || analysis.altText,
        // Merged in the database: renditions write their own key while
        // this runs, and a snapshot spread here would erase it.
        metadata: sql`coalesce(${mediaAssetTable.metadata}, '{}'::jsonb) || ${JSON.stringify({ aiAnalysis: analysis })}::jsonb`,
      })
      .where(eq(mediaAssetTable.id, asset.id));
  });

  return analysis;
}
