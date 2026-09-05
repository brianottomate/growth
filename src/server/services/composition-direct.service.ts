import "server-only";

import {
  compositionFormatIdSchema,
  type CompositionSpec,
} from "@/lib/compositions";
import { isGeminiImageConfigured } from "@/server/clients/gemini-image.client";
import {
  applyDirection,
  critiqueCard,
  extendSource,
  extendToCanvas,
} from "@/server/services/card-director.service";
import {
  CompositionAccessError,
  loadCompositionSource,
  renderComposition,
  resolveCompositionContext,
} from "@/server/services/composition.service";

export type CompositionDirection = {
  verdict: "keep" | "adjust";
  note: string;
  changes: string[];
  title: string;
  subtitle: string | null;
  focal: { x: number; y: number } | null;
  scrim: string | null;
  /** Set when the director had the photo extended; the new source. */
  sourceMediaAssetId: string | null;
};

/**
 * The art director's read of a composition as it stands: render it once, show
 * the card and its photo to the model, and return the corrections as form
 * values. Nothing is saved; the caller decides whether to freeze the result.
 * The Studio button and the chat action are the same call.
 */
export async function directComposition(input: {
  userId: string;
  spec: CompositionSpec;
}): Promise<CompositionDirection> {
  const { spec: raw } = input;
  const context = await loadCompositionSource(
    await resolveCompositionContext(input.userId, raw),
  );
  if (!context.sourceUrl || !raw.sourceMediaAssetId) {
    throw new CompositionAccessError(
      "The art director judges a card against its photo; this blueprint has none.",
      422,
    );
  }
  const spec = { ...raw, assetTitle: raw.title || "preview" };
  const [card, source] = await Promise.all([
    renderComposition(raw, context).arrayBuffer(),
    fetch(context.sourceUrl, { signal: AbortSignal.timeout(20_000) }).then(
      (response) => response.arrayBuffer(),
    ),
  ]);
  const direction = await critiqueCard({
    card: Buffer.from(card),
    source: Buffer.from(source),
    spec,
    brandName: context.brand.name,
    home: { name: raw.title, facts: raw.subtitle ?? "" },
  });
  if (!direction) {
    throw new Error("The art director could not be reached.");
  }
  const applied = applyDirection(spec, direction);
  const changes = [...applied.changes];
  let sourceMediaAssetId: string | null = null;
  let focal = applied.spec.focal ?? null;
  // The same step the homes flow takes: when no crop can show the subject,
  // paint more of the scene in and start from that photo.
  if (direction.verdict === "adjust" && direction.extend !== "none") {
    if (isGeminiImageConfigured) {
      try {
        const extended = await extendSource({
          brandId: raw.brandId,
          userId: input.userId,
          source: { id: raw.sourceMediaAssetId, url: context.sourceUrl },
          formatId: raw.formatId,
          axis: direction.extend,
          home: raw.title || context.brand.name,
        });
        sourceMediaAssetId = extended.id;
        focal = null;
        changes.push(
          `extended the photo ${direction.extend === "vertical" ? "above and below" : "to both sides"} so the subject fits`,
        );
      } catch (error) {
        console.error("photo extension failed", error);
        changes.push("wanted the photo extended, which failed, so the crop stands");
      }
    } else {
      changes.push("wanted the photo extended, which is not configured here");
    }
  }
  return {
    verdict: direction.verdict,
    note: direction.note,
    changes,
    title: applied.spec.title,
    subtitle: applied.spec.subtitle ?? null,
    focal,
    scrim: applied.spec.scrim ?? null,
    sourceMediaAssetId,
  };
}

/**
 * Extend a library photo to a canvas's ratio, on request. Returns the new
 * library asset (or the earlier extension of the same photo).
 */
export async function extendCompositionSource(input: {
  userId: string;
  brandId: string;
  sourceMediaAssetId: string;
  formatId: CompositionSpec["formatId"];
  title?: string;
}) {
  const formatId = compositionFormatIdSchema.parse(input.formatId);
  const context = await resolveCompositionContext(input.userId, {
    brandId: input.brandId,
    templateId: "photo-only",
    formatId,
    sourceMediaAssetId: input.sourceMediaAssetId,
    title: "",
    imagePosition: "center",
    mark: "auto",
  });
  if (!context.sourceUrl) {
    throw new CompositionAccessError("Choose a photo to extend", 422);
  }
  return extendToCanvas({
    brandId: input.brandId,
    userId: input.userId,
    source: { id: input.sourceMediaAssetId, url: context.sourceUrl },
    formatId,
    home: input.title?.trim() || context.brand.name,
  });
}
